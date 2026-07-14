import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const people = await prisma.person.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(people);
  } catch (error: any) {
    console.error('GET /api/people - Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const person = await prisma.person.create({
      data: {
        id: data.id || `P-${Date.now()}`,
        name: data.name,
        phone: data.phone,
        type: data.type,
        cnic: data.cnic,
        status: data.status || 'active',
      },
    });
    return NextResponse.json(person);
  } catch (error: any) {
    console.error('POST /api/people - Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json();
    const { id, ...updateData } = data;
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const person = await prisma.person.update({
      where: { id },
      data: {
        name: updateData.name,
        phone: updateData.phone,
        type: updateData.type,
        cnic: updateData.cnic,
        status: updateData.status,
      },
    });
    return NextResponse.json(person);
  } catch (error: any) {
    console.error('PUT /api/people - Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await prisma.person.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/people - Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
