import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  try {
    const { deviceId, status } = await req.json();

    if (!deviceId || !status) {
      return NextResponse.json({ success: false, message: 'Device ID and status are required.' }, { status: 400 });
    }

    const updatedDevice = await prisma.walletDevice.update({
      where: { id: Number(deviceId) },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      message: `Device status updated to ${status}`,
      device: updatedDevice,
    });
  } catch (error: any) {
    console.error('Wallet Device Status API Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
