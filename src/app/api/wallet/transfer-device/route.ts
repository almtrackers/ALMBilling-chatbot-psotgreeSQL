import { NextRequest, NextResponse } from 'next/server';
import { subMonths, subYears } from 'date-fns';
import prisma from '@/lib/prisma/client';
import { traccarClient } from '@/lib/traccar-client';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (sessionUser?.administrator !== true) {
      return NextResponse.json(
        { success: false, message: 'Traccar administrator login required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const deviceId = Number(body.deviceId);
    const targetUserId = Number(body.targetUserId);

    if (!Number.isInteger(deviceId) || !Number.isInteger(targetUserId)) {
      return NextResponse.json(
        { success: false, message: 'A valid device and destination wallet are required.' },
        { status: 400 }
      );
    }

    const [device, target] = await Promise.all([
      prisma.walletDevice.findUnique({
        where: { id: deviceId },
        include: { user: true },
      }),
      prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);

    if (!device) {
      return NextResponse.json(
        { success: false, message: 'Wallet device not found.' },
        { status: 404 }
      );
    }
    if (!target) {
      return NextResponse.json(
        { success: false, message: 'Destination wallet not found.' },
        { status: 404 }
      );
    }
    if (device.userId === target.id) {
      return NextResponse.json(
        { success: false, message: 'The device already belongs to this wallet.' },
        { status: 409 }
      );
    }
    if (!target.traccarId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Destination wallet must be linked to a Traccar user before receiving a device.',
        },
        { status: 400 }
      );
    }

    // Update Traccar first. A full device payload is required by Traccar PUT.
    const traccarResponse = await traccarClient.get(`/devices/${device.traccarDeviceId}`);
    const traccarDevice = Array.isArray(traccarResponse.data)
      ? traccarResponse.data[0]
      : traccarResponse.data;
    if (!traccarDevice) throw new Error('Device was not found on the Traccar server.');

    const { position, ...devicePayload } = traccarDevice;
    await traccarClient.put(`/devices/${device.traccarDeviceId}`, {
      ...devicePayload,
      attributes: {
        ...(traccarDevice.attributes || {}),
        uId: target.traccarId,
        userId: target.traccarId,
      },
    });

    const transferredAt = new Date();
    const nextBillingDate = new Date(device.nextBillingDate);
    // Anchor the new wallet one period before the existing next due date. The
    // wallet engine skips period 1, so its first debit remains nextBillingDate.
    const billingStartDate =
      device.planType === 'yearly'
        ? subYears(nextBillingDate, 1)
        : subMonths(nextBillingDate, 1);

    try {
      await prisma.$transaction([
        prisma.walletDevice.update({
          where: { id: device.id },
          data: {
            userId: target.id,
            billingStartDate,
            lastChargedAt: transferredAt,
          },
        }),
        prisma.transaction.create({
          data: {
            userId: device.userId,
            deviceId: device.id,
            type: 'transfer',
            amount: 0,
            balanceAfter: device.user.balance,
            description: `Device transferred out — ${device.name} to ${target.name} (wallet #${target.id})`,
            createdAt: transferredAt,
          },
        }),
        prisma.transaction.create({
          data: {
            userId: target.id,
            deviceId: device.id,
            type: 'transfer',
            amount: 0,
            balanceAfter: target.balance,
            description: `Device transferred in — ${device.name} from ${device.user.name} (wallet #${device.userId})`,
            createdAt: transferredAt,
          },
        }),
        prisma.log.create({
          data: {
            action: `Transferred device ${device.name} (${device.traccarDeviceId}) from wallet ${device.user.name} to ${target.name}`,
            adminName: sessionUser.name || sessionUser.email || body.adminName || 'Admin',
            type: 'update',
            createdAt: transferredAt,
          },
        }),
      ]);
    } catch (databaseError) {
      // Keep Traccar and the billing database consistent if the local write fails.
      try {
        await traccarClient.put(`/devices/${device.traccarDeviceId}`, devicePayload);
      } catch (rollbackError) {
        console.error('Failed to roll back Traccar device owner:', rollbackError);
      }
      throw databaseError;
    }

    return NextResponse.json({
      success: true,
      message: `${device.name} transferred from ${device.user.name} to ${target.name}.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Device transfer failed.';
    console.error('Wallet device transfer failed:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
