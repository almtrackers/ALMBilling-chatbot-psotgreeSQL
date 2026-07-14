import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { normalizePhoneNumber } from '@/lib/utils';

const TRACCAR_API_URL = process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

type TraccarUserPayload = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
};

async function fetchTraccarUser(traccarId: number): Promise<TraccarUserPayload | null> {
  if (!TRACCAR_USER || !TRACCAR_PASS) return null;

  try {
    const auth = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
    const response = await fetch(`${TRACCAR_API_URL}/users/${traccarId}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;
    const user = await response.json();
    if (!user?.id) return null;
    return user as TraccarUserPayload;
  } catch (error) {
    console.error(`Failed to fetch Traccar user ${traccarId}:`, error);
    return null;
  }
}

async function ensureLocalUser(options: {
  traccarId: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  const { traccarId, name, phone, email } = options;

  let user = await prisma.user.findUnique({ where: { traccarId } });
  if (user) return user;

  const traccarUser = await fetchTraccarUser(traccarId);
  const resolvedName = name || traccarUser?.name || `Traccar User ${traccarId}`;
  const resolvedPhone = phone || traccarUser?.phone || null;
  const resolvedEmail = email || traccarUser?.email || null;

  try {
    user = await prisma.user.create({
      data: {
        traccarId,
        name: resolvedName,
        phone: resolvedPhone ? normalizePhoneNumber(resolvedPhone).local || resolvedPhone : null,
        email: resolvedEmail,
        status: 'active',
      },
    });
    return user;
  } catch (error: any) {
    // Another request may have created the same traccarId/phone concurrently.
    user = await prisma.user.findUnique({ where: { traccarId } });
    if (user) return user;

    if (resolvedPhone) {
      const byPhone = await prisma.user.findUnique({
        where: { phone: normalizePhoneNumber(resolvedPhone).local || resolvedPhone },
      });
      if (byPhone) {
        return prisma.user.update({
          where: { id: byPhone.id },
          data: {
            traccarId,
            name: byPhone.name || resolvedName,
            email: byPhone.email || resolvedEmail,
          },
        });
      }
    }

    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = Number(req.nextUrl.searchParams.get('userId') || 0);
    if (!userId) {
      return NextResponse.json({ success: false, message: 'userId is required.' }, { status: 400 });
    }

    const user = await ensureLocalUser({ traccarId: userId });
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found in Traccar or local database.' },
        { status: 404 }
      );
    }

    const numbers = await prisma.registrationNumber.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, createdAt: true },
    });

    return NextResponse.json({ success: true, numbers });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, number, name, phone, email } = await req.json();
    const traccarId = Number(userId);
    const normalizedNumber = normalizePhoneNumber(number || '').local;

    if (!traccarId) {
      return NextResponse.json({ success: false, message: 'userId is required.' }, { status: 400 });
    }
    if (!normalizedNumber) {
      return NextResponse.json({ success: false, message: 'Invalid phone number.' }, { status: 400 });
    }

    const user = await ensureLocalUser({
      traccarId,
      name,
      phone: phone || normalizedNumber,
      email,
    });

    await prisma.registrationNumber.upsert({
      where: { number: normalizedNumber },
      update: { userId: user.id },
      create: {
        number: normalizedNumber,
        userId: user.id,
      },
    });

    // Keep wallet/chat user phone filled when empty so agents can find them later.
    if (!user.phone) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phone: normalizedNumber },
      }).catch(() => undefined);
    }

    return NextResponse.json({ success: true, normalizedNumber });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('Add Reg Number API Error:', error);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId, oldNumber, newNumber } = await req.json();
    const traccarId = Number(userId);
    const normalizedOld = normalizePhoneNumber(oldNumber || '').local;
    const normalizedNew = normalizePhoneNumber(newNumber || '').local;

    if (!traccarId || !normalizedOld || !normalizedNew) {
      return NextResponse.json(
        { success: false, message: 'userId, oldNumber and newNumber are required.' },
        { status: 400 }
      );
    }

    const user = await ensureLocalUser({ traccarId });
    const existing = await prisma.registrationNumber.findUnique({
      where: { number: normalizedOld },
    });

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json(
        { success: false, message: 'Registration number not found for selected user.' },
        { status: 404 }
      );
    }

    await prisma.registrationNumber.update({
      where: { number: normalizedOld },
      data: { number: normalizedNew },
    });

    return NextResponse.json({ success: true, normalizedNumber: normalizedNew });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, number } = await req.json();
    const traccarId = Number(userId);
    const normalizedNumber = normalizePhoneNumber(number || '').local;

    if (!traccarId || !normalizedNumber) {
      return NextResponse.json(
        { success: false, message: 'userId and number are required.' },
        { status: 400 }
      );
    }

    const user = await ensureLocalUser({ traccarId });
    const result = await prisma.registrationNumber.deleteMany({
      where: {
        number: normalizedNumber,
        userId: user.id,
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, message: 'Registration number not found for selected user.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
