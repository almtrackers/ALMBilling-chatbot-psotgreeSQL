import type { NextRequest } from 'next/server';

const TRACCAR_API_URL = (process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api').replace(
  /\/$/,
  ''
);

type TraccarSessionUser = {
  id: number;
  name?: string;
  email?: string;
  administrator?: boolean;
};

type CacheEntry = { user: TraccarSessionUser; validUntil: number };

const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
const sessionCache = new Map<string, CacheEntry>();

function pickJsessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const kept = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => {
      const name = c.split('=')[0]?.trim().toLowerCase() ?? '';
      return name === 'jsessionid' || name.startsWith('jsession');
    });
  return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * Resolve the Traccar user behind the request's session cookie.
 * Returns null when there is no cookie or the session is invalid/expired.
 */
export async function getSessionUser(req: NextRequest): Promise<TraccarSessionUser | null> {
  const jsession = pickJsessionCookie(req.headers.get('cookie'));
  if (!jsession) return null;

  const cached = sessionCache.get(jsession);
  if (cached && cached.validUntil > Date.now()) return cached.user;

  try {
    const res = await fetch(`${TRACCAR_API_URL}/session`, {
      headers: { cookie: jsession, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const user = (await res.json()) as TraccarSessionUser;
    if (!user || typeof user.id !== 'number') return null;

    if (sessionCache.size > 500) sessionCache.clear();
    sessionCache.set(jsession, { user, validUntil: Date.now() + SESSION_CACHE_TTL_MS });
    return user;
  } catch {
    return null;
  }
}

/** True only when the request carries a valid Traccar *administrator* session. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const user = await getSessionUser(req);
  return user?.administrator === true;
}
