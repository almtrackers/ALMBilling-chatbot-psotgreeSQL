import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('deviceId');

    if (deviceId) {
      const remarks = await prisma.deviceRemark.findMany({
        where: { deviceId: parseInt(deviceId) },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json(remarks);
    }

    const remarks = await prisma.deviceRemark.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(remarks);
  } catch (error: any) {
    console.error('Device Remarks GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { deviceId, remarks, lastCallDate, addedBy } = data;

    if (!deviceId || !remarks || !addedBy) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const remark = await prisma.deviceRemark.create({
      data: {
        deviceId: parseInt(deviceId),
        remarks,
        lastCallDate: lastCallDate ? new Date(lastCallDate) : null,
        addedBy,
      },
    });

    return NextResponse.json(remark);
  } catch (error: any) {
    console.error('Device Remarks POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
