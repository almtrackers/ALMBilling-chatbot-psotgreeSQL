
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { hash } from 'bcryptjs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const traccarId = searchParams.get('traccarId');

    if (!traccarId) {
      return NextResponse.json({ error: 'Traccar ID is required' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { traccarId: parseInt(traccarId) },
      select: { pin: true },
    });

    return NextResponse.json({ hasPin: !!user?.pin });
  } catch (error: any) {
    console.error('Error checking PIN status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { traccarId, pin } = await req.json();

    if (!traccarId || !pin) {
      return NextResponse.json({ error: 'Traccar ID and PIN are required' }, { status: 400 });
    }

    // Find user in local database by traccarId
    const user = await prisma.user.findFirst({
      where: { traccarId: parseInt(traccarId) },
    });

    if (!user) {
      console.log('PIN update failed - user not found for traccarId:', traccarId);
      return NextResponse.json({ error: 'User not found in local database. Please ensure the user exists locally.' }, { status: 404 });
    }

    // Hash the PIN before storing it
    const hashedPin = await hash(pin, 12);
    console.log('PIN update - hashed PIN:', hashedPin);

    // Force immediate update and verify it was stored
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { pin: hashedPin },
    });

    // Verify the PIN was actually stored as hashed
    console.log('PIN update - stored PIN:', updatedUser.pin);
    console.log('PIN updated successfully for user:', user.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating PIN:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
