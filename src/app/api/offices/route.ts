import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const offices = await prisma.office.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(offices);
  } catch (error: any) {
    console.error('Offices GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const office = await prisma.office.create({
      data: {
        name: data.name,
        createdAt: new Date(),
      },
    });
    return NextResponse.json(office);
  } catch (error: any) {
    console.error('Offices POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
