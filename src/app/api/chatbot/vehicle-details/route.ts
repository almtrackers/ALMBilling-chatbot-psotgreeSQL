import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { getPhoneLookupVariants } from '@/lib/utils';
import { traccarClient as apiClient } from '@/lib/traccar-client';

function getDeviceIds(deviceIds: unknown) {
  if (Array.isArray(deviceIds)) {
    return deviceIds.map((id) => String(id));
  }
  if (typeof deviceIds === 'string') {
    try {
      const parsed = JSON.parse(deviceIds);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function getExpiryDate(device: { attributes: unknown }) {
  const attributes = (device.attributes || {}) as Record<string, unknown>;
  return (attributes.expiryDate as string) || (attributes.expirationTime as string) || null;
}

function getRemainingDays(expiryDate: string | null) {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

async function getRegisteredUserByPhone(phoneNumber: string) {
  const phoneVariants = getPhoneLookupVariants(phoneNumber || '');
  const registration = await prisma.registrationNumber.findFirst({
    where: { number: { in: phoneVariants } },
    include: { user: true },
  });
  return registration?.user || null;
}

export async function GET(req: NextRequest) {
  try {
    const phoneNumber = req.nextUrl.searchParams.get('phoneNumber') || '';
    const deviceId = Number(req.nextUrl.searchParams.get('deviceId'));

    if (!phoneNumber || !deviceId) {
      return NextResponse.json({ error: 'phoneNumber and deviceId are required' }, { status: 400 });
    }

    const user = await getRegisteredUserByPhone(phoneNumber);
    if (!user) {
      return NextResponse.json({ error: 'Registered user not found' }, { status: 404 });
    }

    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        userId: user.traccarId,
      },
      select: {
        id: true,
        name: true,
        uniqueId: true,
        status: true,
        attributes: true,
      },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found for this user' }, { status: 404 });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        customerIdentifier: String(user.traccarId),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 300,
    });

    const relatedInvoices = invoices.filter((invoice) => {
      const ids = getDeviceIds(invoice.deviceIds);
      return ids.includes(String(device.id));
    });

    const firstInvoice = [...relatedInvoices].reverse()[0] || null;
    const lastPaidInvoice = relatedInvoices.find((invoice) => invoice.status?.toLowerCase() === 'paid') || null;
    const currentInvoice = relatedInvoices[0] || null;
    const paymentHistory = relatedInvoices
      .filter((invoice) => invoice.status?.toLowerCase() === 'paid')
      .slice(0, 10)
      .map((invoice) => ({
        id: invoice.id,
        amount: invoice.totalAmount,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        paidAt: invoice.paidAt,
      }));

    const attrs = device.attributes ? JSON.parse(device.attributes) : {};
    const installationDate = attrs.installationDate || null;
    const expiryDate = getExpiryDate({ attributes: attrs });
    const remainingDays = getRemainingDays(expiryDate);

    return NextResponse.json({
      device: {
        id: device.id,
        name: device.name,
        uniqueId: device.uniqueId,
        status: device.status,
        installationDate,
        expiryDate,
        remainingDays,
      },
      saleInfo: firstInvoice
        ? {
            amountPaidAtSale: firstInvoice.totalAmount,
            createdAt: firstInvoice.createdAt,
            periodStart: firstInvoice.periodStart,
            periodEnd: firstInvoice.periodEnd,
          }
        : null,
      lastPaidInvoice: lastPaidInvoice
        ? {
            id: lastPaidInvoice.id,
            amount: lastPaidInvoice.totalAmount,
            periodStart: lastPaidInvoice.periodStart,
            periodEnd: lastPaidInvoice.periodEnd,
            paidAt: lastPaidInvoice.paidAt,
          }
        : null,
      currentInvoice: currentInvoice
        ? {
            id: currentInvoice.id,
            amount: currentInvoice.totalAmount,
            status: currentInvoice.status,
            periodStart: currentInvoice.periodStart,
            periodEnd: currentInvoice.periodEnd,
            createdAt: currentInvoice.createdAt,
          }
        : null,
      paymentHistory,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('GET /api/chatbot/vehicle-details failed:', error);
    return NextResponse.json({ error: err.message || 'Failed to fetch vehicle details' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let deviceId = 0;
  try {
    const body = await req.json();
    const phoneNumber = body.phoneNumber || '';
    deviceId = Number(body.deviceId);

    if (!phoneNumber || !deviceId) {
      return NextResponse.json({ error: 'phoneNumber and deviceId are required' }, { status: 400 });
    }

    const user = await getRegisteredUserByPhone(phoneNumber);
    if (!user) {
      return NextResponse.json({ error: 'Registered user not found' }, { status: 404 });
    }

    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        userId: user.traccarId,
      },
      select: { id: true, name: true },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found for this user' }, { status: 404 });
    }

    await apiClient.post('/commands/send', {
      deviceId: device.id,
      type: 'custom',
      attributes: { data: 'RESET#' },
    });

    await prisma.commandLog.create({
      data: {
        deviceId: device.id,
        command: 'RESET#',
        status: 'sent',
      },
    });

    return NextResponse.json({
      success: true,
      message: `RESET# command sent to ${device.name}`,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (deviceId) {
      await prisma.commandLog
        .create({
          data: {
            deviceId,
            command: 'RESET#',
            status: 'failed',
            response: err?.message || 'Unknown error',
          },
        })
        .catch(() => null);
    }
    console.error('POST /api/chatbot/vehicle-details failed:', error);
    return NextResponse.json({ error: err.message || 'Failed to send RESET# command' }, { status: 500 });
  }
}
