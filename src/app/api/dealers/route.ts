import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const dealers = await prisma.dealer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(dealers);
  } catch (error: any) {
    console.error('Dealers GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const dealer = await prisma.dealer.create({
      data: {
        ...data,
      },
    });
    return NextResponse.json(dealer);
  } catch (error: any) {
    console.error('Dealers POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });

    await prisma.dealer.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Dealers DELETE Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    const { id, ...updateData } = data;
    if (!id) return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });

    const dealer = await prisma.dealer.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json(dealer);
  } catch (error: any) {
    console.error('Dealers PUT Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
