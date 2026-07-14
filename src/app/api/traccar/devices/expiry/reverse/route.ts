
import { NextRequest, NextResponse } from 'next/server';
import { reverseTraccarDeviceExpiry } from '@/lib/invoice-service';

export async function POST(req: NextRequest) {
  try {
    const { deviceId, periodEndDate } = await req.json();

    if (!deviceId || !periodEndDate) {
      return NextResponse.json(
        { error: 'deviceId and periodEndDate are required' },
        { status: 400 }
      );
    }

    await reverseTraccarDeviceExpiry(
      Number(deviceId),
      new Date(periodEndDate)
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/traccar/devices/expiry/reverse - Error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}
