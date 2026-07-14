import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const command = await prisma.customCommand.findUnique({
        where: { id },
      });
      return NextResponse.json(command);
    }

    const commands = await prisma.customCommand.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(commands);
  } catch (error: any) {
    console.error('Commands GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, command } = body;

    if (!name || !command) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const newCommand = await prisma.customCommand.create({
      data: {
        id: uuidv4(),
        name,
        command,
      },
    });

    return NextResponse.json({ success: true, command: newCommand });
  } catch (error: any) {
    console.error('Commands POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, command } = body;

    if (!id || !name || !command) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const updatedCommand = await prisma.customCommand.update({
      where: { id },
      data: {
        name,
        command,
      },
    });

    return NextResponse.json({ success: true, command: updatedCommand });
  } catch (error: any) {
    console.error('Commands PUT Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'Missing id' }, { status: 400 });
    }

    await prisma.customCommand.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Commands DELETE Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
