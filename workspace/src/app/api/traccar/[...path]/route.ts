
import { NextRequest, NextResponse } from 'next/server';

// Use the correct API URL directly to avoid environment variable issues.
const TRACCAR_API_URL = 'https://app.almtrace.com/api';

async function handler(req: NextRequest) {
  if (!TRACCAR_API_URL) {
    return NextResponse.json(
      {
        error: 'Tracking server API URL is not configured.',
        message: 'The TRACCAR_API_URL is missing.',
      },
      { status: 501 }
    );
  }

  try {
    const { pathname, search } = new URL(req.url);
    const apiPath = pathname.replace('/api/traccar', '');
    
    // Construct the target URL; for GET requests, include search params from the original request
    const targetUrl = `${TRACCAR_API_URL}${apiPath}${search}`;

    const headers = new Headers();
    // Forward essential headers from the client request
    if (req.headers.has('authorization')) {
      headers.set('authorization', req.headers.get('authorization')!);
    }
    if (req.headers.has('content-type')) {
      headers.set('content-type', req.headers.get('content-type')!);
    }
    headers.set('accept', req.headers.get('accept') || 'application/json');

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      // Forward the body only if the method is not GET or HEAD
      body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : null,
      // Duplex is required for streaming request bodies
      duplex: 'auto'
    });

    // Recreate the response to send back to the client
    // We need to clone the body stream to avoid "body already read" errors
    const responseBody = response.body ? response.body.tee() : [null, null];
    
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Exclude content-encoding to let Next.js handle it
      if (key.toLowerCase() !== 'content-encoding') {
        responseHeaders.set(key, value);
      }
    });

    return new Response(responseBody[0], {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('Server proxy error:', error);
    return NextResponse.json(
        { error: 'Proxy error', message: error.message || 'Failed to connect to the upstream server.' }, 
        { status: 502 }
    );
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
