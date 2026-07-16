import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { toSmsE164 } from '@/lib/utils';

type IncomingSmsPayload = {
  type?: string;
  gatewayId?: string;
  from?: string;
  message?: string;
  receivedAt?: string;
};

type SaleMatch = {
  id: string | null;
  vehicleNumber: string | null;
  customerName: string | null;
  contactNumber: string | null;
  phoneRobocall: string | null;
  simNumber: string | null;
  imsi: string | null;
};

function isAuthorized(req: NextRequest) {
  const expected = process.env.SMS_WEBHOOK_TOKEN?.trim();
  if (!expected) return true;
  return req.headers.get('authorization') === expected;
}

/**
 * Canonical SIM key: last 10 digits of the number.
 * Makes +923238920729, 923238920729, 03238920729 and 3238920729 all equal.
 */
function canonicalSim(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

async function findSaleBySim(fromNumber: string): Promise<SaleMatch | null> {
  const key = canonicalSim(fromNumber);
  if (!key) return null;

  const saleSelect = {
    id: true,
    vehicleNumber: true,
    customerName: true,
    contactNumber: true,
    phoneRobocall: true,
    simNumber: true,
    imsi: true,
  } as const;

  const sales = await prisma.sale.findMany({
    where: { simNumber: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { ...saleSelect, status: true },
  });

  const matching = sales.filter((sale) => canonicalSim(sale.simNumber) === key);
  const active = matching.find((sale) => sale.status !== 'unsubscribed');
  const sale = active || matching[0];
  if (sale) return sale;

  const companyVehicles = await prisma.companyVehicle.findMany({
    where: { simNumber: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      vehicleNumber: true,
      customerName: true,
      contactNumber: true,
      phoneRobocall: true,
      simNumber: true,
      imsi: true,
    },
  });

  const company = companyVehicles.find(
    (vehicle) => canonicalSim(vehicle.simNumber) === key
  );
  if (company) {
    return { ...company, id: null };
  }

  return null;
}

/** Fill in vehicle/customer for rows saved before the sale SIM was matched. */
async function rematchUnknownRows() {
  const unmatched = await prisma.smsResponse.findMany({
    where: { vehicleNumber: null },
    orderBy: { receivedAt: 'desc' },
    take: 50,
  });

  for (const row of unmatched) {
    const sale = await findSaleBySim(row.fromNumber);
    if (!sale?.vehicleNumber) continue;
    await prisma.smsResponse.update({
      where: { id: row.id },
      data: {
        vehicleNumber: sale.vehicleNumber,
        customerName: sale.customerName,
        customerNumber: sale.contactNumber || sale.phoneRobocall || null,
        saleId: sale.id,
        imsi: sale.imsi,
      },
    });
  }
}

export async function GET() {
  try {
    await rematchUnknownRows();
    const messages = await prisma.smsResponse.findMany({
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ success: true, messages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load SMS messages';
    console.error('GET /api/sms failed:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as IncomingSmsPayload;
    const gatewayId = body.gatewayId?.trim();
    const fromNumber = body.from?.trim();
    const message = body.message?.trim();
    const receivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();

    if (body.type && body.type !== 'sms_received') {
      return NextResponse.json({ success: false, message: 'Unsupported event type' }, { status: 400 });
    }
    if (!gatewayId || !fromNumber || !message || Number.isNaN(receivedAt.getTime())) {
      return NextResponse.json(
        { success: false, message: 'gatewayId, from, message and valid receivedAt are required' },
        { status: 400 }
      );
    }

    const normalizedFrom = toSmsE164(fromNumber);
    if (!normalizedFrom) {
      return NextResponse.json({ success: false, message: 'Invalid sender number' }, { status: 400 });
    }

    const duplicate = await prisma.smsResponse.findFirst({
      where: { gatewayId, normalizedFrom, message, receivedAt },
    });
    if (duplicate) {
      return NextResponse.json({ success: true, duplicate: true, sms: duplicate });
    }

    const sale = await findSaleBySim(fromNumber);
    const sms = await prisma.smsResponse.create({
      data: {
        type: 'sms_received',
        gatewayId,
        fromNumber,
        normalizedFrom,
        message,
        receivedAt,
        vehicleNumber: sale?.vehicleNumber || null,
        customerName: sale?.customerName || null,
        customerNumber: sale?.contactNumber || sale?.phoneRobocall || null,
        saleId: sale?.id || null,
        imsi: sale?.imsi || null,
      },
    });

    return NextResponse.json({ success: true, sms }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save SMS';
    console.error('POST /api/sms failed:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = await prisma.smsResponse.deleteMany();
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete SMS messages';
    console.error('DELETE /api/sms failed:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
