import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { serializeSale } from '@/lib/db/serialize';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const dealerId = searchParams.get('dealerId');
    const vehicleNumber = searchParams.get('vehicleNumber');
    
    const where: Record<string, string> = {};
    if (id) where.id = id;
    if (dealerId) where.dealerId = dealerId;
    if (vehicleNumber) where.vehicleNumber = vehicleNumber;

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    
    return NextResponse.json(sales.map((sale) => serializeSale(sale)));
  } catch (error: any) {
    console.error('Sales GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { walletSync, hasPaidAmount, paidAmount, ...rest } = await req.json();
    
    const sale = await prisma.sale.create({
      data: {
        ...rest,
        date: new Date(rest.date),
        createdAt: new Date(),
        amount: Number(rest.amount),
        devicePrice: rest.devicePrice ? Number(rest.devicePrice) : null,
        currentPeriodCharges: rest.currentPeriodCharges ? Number(rest.currentPeriodCharges) : null,
        commission: rest.commission ? Number(rest.commission) : null,
        renewalFee: rest.renewalFee ? Number(rest.renewalFee) : null,
        simCharges: rest.simCharges ? Number(rest.simCharges) : null,
        discount: rest.discount ? Number(rest.discount) : null,
        notificationIds: JSON.stringify(rest.notificationIds || []),
      },
    });

    // If walletSync is provided, we could optionally handle it here 
    // but AddSaleForm and QuickSaleForm currently handle their own wallet calls or 
    // are being updated to do so for consistency.
    
    return NextResponse.json(serializeSale(sale));
  } catch (error: any) {
    console.error('Sales POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
