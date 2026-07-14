import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const { items, userName } = await req.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ success: false, message: 'Invalid data format' }, { status: 400 });
    }

    let itemsAddedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const saleDate = new Date(item.date);
        if (isNaN(saleDate.getTime())) continue;

        await tx.sale.create({
          data: {
            id: uuidv4(),
            customerName: item.customerName || '',
            vehicleNumber: item.vehicleNumber || '',
            amount: Number(item.amount) || 0,
            date: saleDate,
            monthId: format(saleDate, 'yyyy-MM'),
            imei: item.imei || '',
            simNumber: item.simNumber || '',
            imsi: item.imsi || '',
            phoneRobocall: item.phoneRobocall || '',
            contactNumber: item.contactNumber || '',
            createdBy: item.createdBy || userName || 'Admin',
            notes: item.notes || '',
            createdAt: new Date(),
            status: 'active',
            // Optional technical IDs if provided
            trackerId: item.trackerId || null,
            harnessId: item.harnessId || null,
            simId: item.simId || null,
          },
        });
        itemsAddedCount++;
      }
    });

    return NextResponse.json({
      success: true,
      count: itemsAddedCount,
      message: `Successfully imported ${itemsAddedCount} sales.`,
    });
  } catch (error: any) {
    console.error('Bulk Sales Import Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
