import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRACCAR_API_URL = (process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api').replace(
  /\/$/,
  ''
);

// Service account from .env — ALL Traccar API work runs under this account.
// Logged-in users' own credentials/sessions are used for authentication only.
const SERVICE_USER = process.env.TRACCAR_USER;
const SERVICE_PASS = process.env.TRACCAR_PASS;
const SERVICE_AUTH =
  SERVICE_USER && SERVICE_PASS
    ? `Basic ${Buffer.from(`${SERVICE_USER}:${SERVICE_PASS}`).toString('base64')}`
    : null;

function isHttps(req: NextRequest): boolean {
  if (req.nextUrl.protocol === 'https:') return true;
  const forwarded = req.headers.get('x-forwarded-proto');
  return forwarded?.split(',')[0]?.trim() === 'https';
}

/** Keep only Traccar session cookies — never forward CF / app cookies upstream. */
function pickTraccarCookies(cookieHeader: string | null): string | null {
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

// --- Caller session validation -------------------------------------------
// The proxy acts with admin-level service credentials, so we must confirm the
// caller is actually logged in before serving anything. Valid session cookies
// are cached briefly to avoid a validation round-trip on every request.

const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
const sessionCache = new Map<string, number>();

async function isCallerSessionValid(jsessionCookie: string): Promise<boolean> {
  const cachedUntil = sessionCache.get(jsessionCookie);
  if (cachedUntil && cachedUntil > Date.now()) return true;

  try {
    const res = await fetch(`${TRACCAR_API_URL}/session`, {
      headers: { cookie: jsessionCookie, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return false;

    if (sessionCache.size > 500) sessionCache.clear();
    sessionCache.set(jsessionCookie, Date.now() + SESSION_CACHE_TTL_MS);
    return true;
  } catch {
    return false;
  }
}

function rewriteSetCookie(cookie: string, req: NextRequest): string {
  const parts = cookie.split(';').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return cookie;

  const nameValue = parts[0];
  const attrs = parts.slice(1).filter((attr) => {
    const lower = attr.toLowerCase();
    return (
      !lower.startsWith('domain=') &&
      !lower.startsWith('path=') &&
      !lower.startsWith('samesite=') &&
      lower !== 'secure'
    );
  });

  attrs.push('Path=/');
  attrs.push('SameSite=Lax');
  if (isHttps(req)) {
    attrs.push('Secure');
  }

  return [nameValue, ...attrs].join('; ');
}

function copyResponseHeaders(
  from: Headers,
  to: Headers,
  req: NextRequest,
  { includeSetCookies }: { includeSetCookies: boolean }
) {
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'content-encoding',
    'content-length',
  ]);

  from.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (hopByHop.has(lower) || lower === 'set-cookie') return;
    to.set(key, value);
  });

  // When acting as the service account, upstream Set-Cookie headers belong to
  // the service session — forwarding them would overwrite the user's own
  // login cookie in the browser. Only forward cookies in fallback mode.
  if (!includeSetCookies) return;

  const setCookies =
    typeof from.getSetCookie === 'function'
      ? from.getSetCookie()
      : from.get('set-cookie')
        ? [from.get('set-cookie')!]
        : [];

  for (const cookie of setCookies) {
    to.append('set-cookie', rewriteSetCookie(cookie, req));
  }
}

async function handler(req: NextRequest) {
  if (!TRACCAR_API_URL) {
    return NextResponse.json(
      {
        error: 'Tracking server API URL is not configured.',
        message: 'Please set the TRACCAR_API_URL environment variable.',
      },
      { status: 501 }
    );
  }

  try {
    const { pathname, search } = new URL(req.url);
    const apiPath = pathname.replace(/^\/api\/traccar/, '') || '/';
    const targetUrl = `${TRACCAR_API_URL}${apiPath}${search}`;

    const traccarCookie = pickTraccarCookies(req.headers.get('cookie'));
    const useServiceAuth = !!SERVICE_AUTH;

    const headers = new Headers();

    if (useServiceAuth) {
      // The caller's session is checked for authentication only; the actual
      // request runs under the .env service account so every user sees the
      // same data and permissions.
      if (!traccarCookie || !(await isCallerSessionValid(traccarCookie))) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'A valid login session is required.' },
          { status: 401 }
        );
      }
      headers.set('authorization', SERVICE_AUTH!);
    } else if (traccarCookie) {
      // Fallback when no service credentials are configured: forward the
      // user's own session cookie (legacy behavior).
      headers.set('cookie', traccarCookie);
    }

    const contentType = req.headers.get('content-type');
    if (contentType) {
      headers.set('content-type', contentType);
    }
    headers.set('accept', req.headers.get('accept') || 'application/json');

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
      redirect: 'manual',
      cache: 'no-store',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 0) {
        fetchOptions.body = Buffer.from(buf);
      }
    }

    const response = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers();
    copyResponseHeaders(response.headers, responseHeaders, req, {
      includeSetCookies: !useServiceAuth,
    });

    if (response.status === 204) {
      return new Response(null, {
        status: 204,
        statusText: 'No Content',
        headers: responseHeaders,
      });
    }

    const responseBody = await response.arrayBuffer();

    if (!response.ok) {
      const errorText = new TextDecoder().decode(responseBody);
      console.error(
        `Traccar API Error:\n- Path: ${apiPath}\n- Method: ${req.method}\n- Status: ${response.status}\n- Body: ${errorText}`
      );
      return new Response(errorText || response.statusText, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to connect to the upstream server.';
    console.error('Server proxy error:', error);
    return NextResponse.json({ error: 'Proxy error', message }, { status: 502 });
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
