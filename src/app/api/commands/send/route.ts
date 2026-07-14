import { NextRequest, NextResponse } from 'next/server';
import { sendDeviceCommand } from '@/lib/traccar-commands';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deviceId = Number(body.deviceId);
    const command = String(body.command || '').trim();
    const channel = body.channel as 'auto' | 'network' | 'sms' | undefined;
    const smsTo = body.smsTo ? String(body.smsTo).trim() : undefined;

    if (!Number.isFinite(deviceId) || deviceId <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid deviceId' }, { status: 400 });
    }
    if (!command) {
      return NextResponse.json({ success: false, message: 'Command is required' }, { status: 400 });
    }

    const result = await sendDeviceCommand(deviceId, command, {
      channel: channel || 'auto',
      smsTo,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send command';
    console.error('POST /api/commands/send failed:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
