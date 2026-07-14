import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { requireAdminSession } from '@/lib/client-documents/auth';
import { readUploadFile, replaceUploadFile, saveVehicleCard } from '@/lib/client-documents/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ type: string; id: string }> };

async function loadVehicle(type: string, id: string) {
  if (type === 'sale') {
    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale) return null;
    return {
      type: 'sale' as const,
      id: sale.id,
      customerName: sale.customerName,
      vehicleNumber: sale.vehicleNumber,
      vehicleCardPath: sale.vehicleCardPath,
    };
  }
  if (type === 'company') {
    const vehicle = await prisma.companyVehicle.findUnique({ where: { id } });
    if (!vehicle) return null;
    return {
      type: 'company' as const,
      id: vehicle.id,
      customerName: vehicle.customerName,
      vehicleNumber: vehicle.vehicleNumber,
      vehicleCardPath: vehicle.vehicleCardPath,
    };
  }
  return null;
}

async function resolveCnicForCustomer(customerName: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { name: { equals: customerName, mode: 'insensitive' } },
    select: { cnic: true },
  });
  return user?.cnic || null;
}

export async function GET(req: NextRequest, context: Ctx) {
  const auth = await requireAdminSession(req);
  if ('error' in auth) return auth.error;

  const { type, id } = await context.params;
  const vehicle = await loadVehicle(type, id);
  if (!vehicle) {
    return NextResponse.json({ success: false, message: 'Vehicle not found.' }, { status: 404 });
  }
  if (!vehicle.vehicleCardPath) {
    return NextResponse.json(
      { success: false, message: 'No document uploaded' },
      { status: 404 }
    );
  }

  try {
    const file = await readUploadFile(vehicle.vehicleCardPath);
    const download = req.nextUrl.searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(file.data), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${file.fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to read document';
    return NextResponse.json({ success: false, message }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, context: Ctx) {
  const auth = await requireAdminSession(req);
  if ('error' in auth) return auth.error;

  const { type, id } = await context.params;
  const vehicle = await loadVehicle(type, id);
  if (!vehicle) {
    return NextResponse.json({ success: false, message: 'Vehicle not found.' }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { success: false, message: 'Vehicle registration card is required.' },
      { status: 400 }
    );
  }

  const cnic =
    String(form.get('cnic') || '').trim() ||
    (await resolveCnicForCustomer(vehicle.customerName));
  if (!cnic) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Customer has no CNIC on file. Create/update the user with CNIC documents first.',
      },
      { status: 400 }
    );
  }

  try {
    const stored = await replaceUploadFile({
      previousRelativePath: vehicle.vehicleCardPath,
      cnic,
      customerName: vehicle.customerName,
      kind: 'vehicle_card',
      vehicleNumber: vehicle.vehicleNumber,
      file,
      actor: auth.user.name,
    });

    if (vehicle.type === 'sale') {
      await prisma.sale.update({
        where: { id: vehicle.id },
        data: { vehicleCardPath: stored.relativePath },
      });
    } else {
      await prisma.companyVehicle.update({
        where: { id: vehicle.id },
        data: { vehicleCardPath: stored.relativePath },
      });
    }

    return NextResponse.json({ success: true, vehicleCardPath: stored.relativePath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

/** Attach card during create flows that already have an id. */
export async function POST(req: NextRequest, context: Ctx) {
  const auth = await requireAdminSession(req);
  if ('error' in auth) return auth.error;

  const { type, id } = await context.params;
  const vehicle = await loadVehicle(type, id);
  if (!vehicle) {
    return NextResponse.json({ success: false, message: 'Vehicle not found.' }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { success: false, message: 'Vehicle registration card is required.' },
      { status: 400 }
    );
  }

  const cnic =
    String(form.get('cnic') || '').trim() ||
    (await resolveCnicForCustomer(vehicle.customerName));
  if (!cnic) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Customer has no CNIC on file. Create/update the user with CNIC documents first.',
      },
      { status: 400 }
    );
  }

  try {
    const stored = await saveVehicleCard({
      cnic,
      customerName: vehicle.customerName,
      vehicleNumber: vehicle.vehicleNumber,
      file,
      actor: auth.user.name,
    });

    if (vehicle.type === 'sale') {
      await prisma.sale.update({
        where: { id: vehicle.id },
        data: { vehicleCardPath: stored.relativePath },
      });
    } else {
      await prisma.companyVehicle.update({
        where: { id: vehicle.id },
        data: { vehicleCardPath: stored.relativePath },
      });
    }

    return NextResponse.json({ success: true, vehicleCardPath: stored.relativePath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
