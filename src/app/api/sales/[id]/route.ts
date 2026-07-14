import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { serializeSale } from '@/lib/db/serialize';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await req.json();

    const sale = await prisma.sale.update({
      where: { id },
      data,
    });

    return NextResponse.json(serializeSale(sale));
  } catch (error: any) {
    console.error('Sales PUT Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.sale.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Sales DELETE Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
