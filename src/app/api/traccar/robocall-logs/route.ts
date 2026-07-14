import { NextRequest, NextResponse } from 'next/server';

const TRACCAR_API_URL = process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

/**
 * Fetches robocall logs from Traccar using server-side credentials.
 * Returns an empty array when upstream is unavailable so invoice UI keeps working.
 */
export async function GET(req: NextRequest) {
  try {
    if (!TRACCAR_USER || !TRACCAR_PASS) {
      return NextResponse.json([]);
    }

    const { search } = new URL(req.url);
    const auth = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');

    const response = await fetch(`${TRACCAR_API_URL}/robocall-logs${search}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(
        `Robocall logs upstream ${response.status}: ${body.slice(0, 200) || response.statusText}`
      );
      return NextResponse.json([]);
    }

    const data = await response.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.warn('Robocall logs fetch failed:', error);
    return NextResponse.json([]);
  }
}
