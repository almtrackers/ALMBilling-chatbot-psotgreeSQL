import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const vehicles = await prisma.companyVehicle.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(vehicles);
  } catch (error: any) {
    console.error('Company Vehicles GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const vehicle = await prisma.companyVehicle.create({
      data: {
        id: data.id || `veh_${Date.now()}`,
        customerName: data.customerName,
        date: data.date ? new Date(data.date) : new Date(),
        vehicleNumber: data.vehicleNumber,
        monthId: data.monthId,
        notes: data.notes,
        createdBy: data.createdBy,
        dealerId: data.dealerId,
        trackerId: data.trackerId,
        imei: data.imei,
        harnessId: data.harnessId,
        relayId: data.relayId,
        micId: data.micId,
        sosButtonId: data.sosButtonId,
        simId: data.simId,
        simNumber: data.simNumber,
        imsi: data.imsi,
        phoneRobocall: data.phoneRobocall,
        contactNumber: data.contactNumber,
        notificationIds: JSON.stringify(data.notificationIds || []),
      },
    });
    return NextResponse.json(vehicle);
  } catch (error: any) {
    console.error('Company Vehicles POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
