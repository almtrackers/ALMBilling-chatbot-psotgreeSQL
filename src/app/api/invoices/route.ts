import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const customerIdentifier = searchParams.get('customerIdentifier');
    
    const where: Record<string, string> = {};
    if (id) where.id = id;
    if (status) where.status = status;
    if (customerIdentifier) where.customerIdentifier = customerIdentifier;

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    
    return NextResponse.json(invoices);
  } catch (error: any) {
    console.error('Invoices GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    
    const invoice = await prisma.invoice.create({
      data: {
        ...data,
        deviceIds: JSON.stringify(data.deviceIds || []),
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        paidAt: data.paidAt ? new Date(data.paidAt) : null,
      },
    });
    
    return NextResponse.json(invoice);
  } catch (error: any) {
    console.error('Invoices POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
