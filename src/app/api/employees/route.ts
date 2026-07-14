import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(employees);
  } catch (error: any) {
    console.error('Employees GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const employee = await prisma.employee.create({
      data: {
        name: data.name,
        phone: data.phone,
        createdAt: new Date(),
      },
    });
    return NextResponse.json(employee);
  } catch (error: any) {
    console.error('Employees POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
