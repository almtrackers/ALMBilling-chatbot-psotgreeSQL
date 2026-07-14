import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { serializeExpense } from '@/lib/db/serialize';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const isRecurring = searchParams.get('isRecurring');
    const monthId = searchParams.get('monthId');
    
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (monthId) where.monthId = monthId;
    if (isRecurring !== null) where.isRecurring = isRecurring === 'true';

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    
    return NextResponse.json(expenses.map((expense) => serializeExpense(expense)));
  } catch (error: any) {
    console.error('Expenses GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    
    const expense = await prisma.expense.create({
      data: {
        ...data,
        amount: Number(data.amount),
        date: new Date(data.date),
        createdAt: new Date(),
        approvedAt: data.approvedAt ? new Date(data.approvedAt) : null,
      },
    });
    
    return NextResponse.json(serializeExpense(expense));
  } catch (error: any) {
    console.error('Expenses POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    const { id, ...updateData } = data;
    if (!id) return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...updateData,
        amount: updateData.amount !== undefined ? Number(updateData.amount) : undefined,
        date: updateData.date ? new Date(updateData.date) : undefined,
        approvedAt: updateData.approvedAt ? new Date(updateData.approvedAt) : (updateData.approvedAt === null ? null : undefined),
      },
    });
    return NextResponse.json(serializeExpense(expense));
  } catch (error: any) {
    console.error('Expenses PUT Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });

    await prisma.expense.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Expenses DELETE Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
