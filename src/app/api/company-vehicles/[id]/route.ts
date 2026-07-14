import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await req.json();

    const vehicle = await prisma.companyVehicle.update({
      where: { id },
      data,
    });

    return NextResponse.json(vehicle);
  } catch (error: any) {
    console.error('Company Vehicles PUT Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.companyVehicle.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Company Vehicles DELETE Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
