import { NextRequest, NextResponse } from 'next/server';

const TRACCAR_API_URL = (process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api').replace(
  /\/$/,
  ''
);

function pickJsession(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const kept = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.toLowerCase().startsWith('jsessionid='));
  return kept.length ? kept.join('; ') : null;
}

export type SessionUser = {
  id: number;
  name: string;
  email?: string;
  administrator?: boolean;
};

/**
 * Require an authenticated Traccar admin session (JSESSIONID cookie).
 */
export async function requireAdminSession(
  req: NextRequest
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const cookie = pickJsession(req.headers.get('cookie'));
  if (!cookie) {
    return {
      error: NextResponse.json(
        { success: false, message: 'Authentication required.' },
        { status: 401 }
      ),
    };
  }

  try {
    const response = await fetch(`${TRACCAR_API_URL}/session`, {
      headers: { cookie, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        error: NextResponse.json(
          { success: false, message: 'Authentication required.' },
          { status: 401 }
        ),
      };
    }
    const user = (await response.json()) as SessionUser;
    if (!user?.administrator) {
      return {
        error: NextResponse.json(
          { success: false, message: 'Administrator privileges required.' },
          { status: 403 }
        ),
      };
    }
    return { user };
  } catch {
    return {
      error: NextResponse.json(
        { success: false, message: 'Failed to verify session.' },
        { status: 502 }
      ),
    };
  }
}
