import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await req.json();

    // Remove any fields that shouldn't be updated directly via this generic PATCH
    const { id: _, createdAt: __, updatedAt: ___, ...updateData } = data;

    // Handle date fields if they are present in updateData
    if (updateData.periodStart) updateData.periodStart = new Date(updateData.periodStart);
    if (updateData.periodEnd) updateData.periodEnd = new Date(updateData.periodEnd);
    if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate);
    if (updateData.expiryDate) updateData.expiryDate = new Date(updateData.expiryDate);
    if (updateData.paidAt) updateData.paidAt = new Date(updateData.paidAt);

    // Handle deviceIds if it's an array
    if (Array.isArray(updateData.deviceIds)) {
      updateData.deviceIds = JSON.stringify(updateData.deviceIds);
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(invoice);
  } catch (error: any) {
    console.error('Invoice PATCH Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.invoice.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Invoice DELETE Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
