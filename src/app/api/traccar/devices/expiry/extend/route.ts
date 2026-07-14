
import { NextRequest, NextResponse } from 'next/server';
import { extendTraccarDeviceExpiry } from '@/lib/invoice-service';

export async function POST(req: NextRequest) {
  try {
    const { deviceId, targetExpiry, durationType, daysToAdd } = await req.json();

    if (!deviceId || !targetExpiry || !durationType) {
      return NextResponse.json(
        { error: 'deviceId, targetExpiry, and durationType are required' },
        { status: 400 }
      );
    }

    await extendTraccarDeviceExpiry(
      Number(deviceId),
      new Date(targetExpiry),
      durationType,
      daysToAdd
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/traccar/devices/expiry/extend - Error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}
