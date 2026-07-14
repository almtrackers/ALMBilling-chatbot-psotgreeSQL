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

function applySetCookies(from: Headers, to: Headers, req: NextRequest) {
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

function pickJsessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const kept = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.toLowerCase().startsWith('jsessionid='));
  return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * Dedicated session proxy.
 *
 * Cloudflare (and similar) may inject Authorization / JWT headers on
 * test.almtrace.com. Forwarding those to Traccar makes CryptoManager throw
 * ArrayIndexOutOfBoundsException (HTTP 400). Login must use form body only.
 */
async function proxySession(req: NextRequest) {
  const targetUrl = `${TRACCAR_API_URL}/session`;
  const headers = new Headers();
  headers.set('accept', 'application/json');

  // Never forward Authorization — CF Access / edge JWTs break Traccar.
  // Only forward JSESSIONID for GET/DELETE restore & logout.
  if (req.method === 'GET' || req.method === 'DELETE') {
    const jsession = pickJsessionCookie(req.headers.get('cookie'));
    if (jsession) {
      headers.set('cookie', jsession);
    }
  }

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };

  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || 'application/x-www-form-urlencoded';
    headers.set('content-type', contentType.includes('urlencoded')
      ? 'application/x-www-form-urlencoded'
      : contentType);

    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) {
      return NextResponse.json(
        { error: 'Missing login body', message: 'email and password are required.' },
        { status: 400 }
      );
    }
    fetchOptions.body = Buffer.from(buf);
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);
    const responseHeaders = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) responseHeaders.set('content-type', contentType);
    applySetCookies(response.headers, responseHeaders, req);

    const body = await response.arrayBuffer();

    if (!response.ok) {
      const text = new TextDecoder().decode(body);
      console.error(
        `Traccar session ${req.method} failed: ${response.status} ${text.slice(0, 200)}`
      );
      return new Response(text || response.statusText, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    return new Response(body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upstream connection failed';
    console.error('Traccar session proxy error:', error);
    return NextResponse.json({ error: 'Proxy error', message }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return proxySession(req);
}

export async function POST(req: NextRequest) {
  return proxySession(req);
}

export async function DELETE(req: NextRequest) {
  return proxySession(req);
}
