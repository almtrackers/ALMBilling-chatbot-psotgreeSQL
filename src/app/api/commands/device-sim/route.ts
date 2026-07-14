import { NextRequest, NextResponse } from 'next/server';
import { getDeviceSimInfo } from '@/lib/traccar-commands';

export async function GET(req: NextRequest) {
  try {
    const deviceId = Number(req.nextUrl.searchParams.get('deviceId'));
    if (!Number.isFinite(deviceId) || deviceId <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid deviceId' }, { status: 400 });
    }

    const info = await getDeviceSimInfo(deviceId);
    return NextResponse.json({ success: true, ...info });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load SIM info';
    console.error('GET /api/commands/device-sim failed:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
