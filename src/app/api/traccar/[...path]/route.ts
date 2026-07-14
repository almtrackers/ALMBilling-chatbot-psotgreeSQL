import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRACCAR_API_URL = (process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api').replace(
  /\/$/,
  ''
);

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

function copyResponseHeaders(from: Headers, to: Headers, req: NextRequest) {
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

    const headers = new Headers();

    // Do NOT forward Authorization from the browser.
    // Cloudflare Access / edge proxies may inject Bearer JWTs that make Traccar's
    // CryptoManager throw ArrayIndexOutOfBoundsException (HTTP 400).
    // Server routes that need Basic auth call Traccar directly.

    const traccarCookie = pickTraccarCookies(req.headers.get('cookie'));
    if (traccarCookie) {
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
    copyResponseHeaders(response.headers, responseHeaders, req);

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
