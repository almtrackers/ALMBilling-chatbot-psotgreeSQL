import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { requireAdminSession } from '@/lib/client-documents/auth';
import { normalizeCnic } from '@/lib/client-documents/validate';
import { saveClientDocument } from '@/lib/client-documents/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if ('error' in auth) return auth.error;

  try {
    const clients = await prisma.user.findMany({
      select: {
        id: true,
        traccarId: true,
        name: true,
        email: true,
        phone: true,
        cnic: true,
        cnicFrontPath: true,
        cnicBackPath: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ success: true, clients });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list clients';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

/**
 * Sync / create Prisma User with CNIC docs after Traccar user exists.
 * multipart fields: name, cnic, traccarId?, email?, phone?, cnicFront, cnicBack
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if ('error' in auth) return auth.error;

  try {
    const form = await req.formData();
    const name = String(form.get('name') || '').trim();
    const cnicRaw = String(form.get('cnic') || '').trim();
    const cnicExpiryRaw = String(form.get('cnicExpiry') || '').trim();
    const email = String(form.get('email') || '').trim() || null;
    const phone = String(form.get('phone') || '').trim() || null;
    const traccarIdRaw = String(form.get('traccarId') || '').trim();
    const traccarId = traccarIdRaw ? Number(traccarIdRaw) : null;
    const cnicFront = form.get('cnicFront');
    const cnicBack = form.get('cnicBack');

    if (!name) {
      return NextResponse.json(
        { success: false, message: 'Name is required.' },
        { status: 400 }
      );
    }

    const cnic = normalizeCnic(cnicRaw);
    if (!cnic) {
      return NextResponse.json(
        { success: false, message: 'Invalid CNIC. Use 13 digits or format XXXXX-XXXXXXX-X.' },
        { status: 400 }
      );
    }

    if (!cnicExpiryRaw) {
      return NextResponse.json(
        { success: false, message: 'CNIC expiry date is required.' },
        { status: 400 }
      );
    }
    const cnicExpiry = new Date(cnicExpiryRaw);
    if (isNaN(cnicExpiry.getTime())) {
      return NextResponse.json(
        { success: false, message: 'Invalid CNIC expiry date.' },
        { status: 400 }
      );
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (cnicExpiry < startOfToday) {
      return NextResponse.json(
        { success: false, message: 'This CNIC is expired. Expired ID cards cannot be added.' },
        { status: 400 }
      );
    }

    if (!(cnicFront instanceof File) || cnicFront.size === 0) {
      return NextResponse.json(
        { success: false, message: 'CNIC Front Image is required.' },
        { status: 400 }
      );
    }
    if (!(cnicBack instanceof File) || cnicBack.size === 0) {
      return NextResponse.json(
        { success: false, message: 'CNIC Back Image is required.' },
        { status: 400 }
      );
    }

    const existingCnic = await prisma.user.findUnique({ where: { cnic: cnic.formatted } });
    if (existingCnic) {
      return NextResponse.json(
        { success: false, message: 'Duplicate CNIC. A client with this CNIC already exists.' },
        { status: 409 }
      );
    }

    const front = await saveClientDocument({
      cnic: cnic.formatted,
      customerName: name,
      kind: 'cnic_front',
      file: cnicFront,
      actor: auth.user.name,
    });
    const back = await saveClientDocument({
      cnic: cnic.formatted,
      customerName: name,
      kind: 'cnic_back',
      file: cnicBack,
      actor: auth.user.name,
    });

    let user;
    if (traccarId) {
      user = await prisma.user.upsert({
        where: { traccarId },
        create: {
          traccarId,
          name,
          email,
          phone,
          cnic: cnic.formatted,
          cnicExpiry,
          cnicFrontPath: front.relativePath,
          cnicBackPath: back.relativePath,
        },
        update: {
          name,
          email: email ?? undefined,
          phone: phone ?? undefined,
          cnic: cnic.formatted,
          cnicExpiry,
          cnicFrontPath: front.relativePath,
          cnicBackPath: back.relativePath,
        },
      });
    } else if (phone) {
      user = await prisma.user.upsert({
        where: { phone },
        create: {
          name,
          email,
          phone,
          cnic: cnic.formatted,
          cnicExpiry,
          cnicFrontPath: front.relativePath,
          cnicBackPath: back.relativePath,
        },
        update: {
          name,
          email: email ?? undefined,
          cnic: cnic.formatted,
          cnicExpiry,
          cnicFrontPath: front.relativePath,
          cnicBackPath: back.relativePath,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name,
          email,
          phone,
          cnic: cnic.formatted,
          cnicExpiry,
          cnicFrontPath: front.relativePath,
          cnicBackPath: back.relativePath,
        },
      });
    }

    return NextResponse.json({ success: true, client: user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save client documents';
    console.error('POST /api/clients', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
