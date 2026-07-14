import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import axios from 'axios';

const TRACCAR_API_URL = process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

export async function POST(req: NextRequest) {
  try {
    const { deviceId, deductHours } = await req.json();

    if (!deviceId || deductHours === undefined) {
      return NextResponse.json({ success: false, message: 'Device ID and deduct hours are required' }, { status: 400 });
    }

    const hours = parseFloat(deductHours);
    if (isNaN(hours) || hours < 0) {
      return NextResponse.json({ success: false, message: 'Invalid deduct hours' }, { status: 400 });
    }

    const device = await prisma.walletDevice.findUnique({
      where: { id: parseInt(deviceId) },
      include: { user: true },
    });

    if (!device) {
      return NextResponse.json({ success: false, message: 'Device not found' }, { status: 404 });
    }

    const hourlyCost = new Decimal(device.dailyCost).div(24);
    const concessionAmount = hourlyCost.mul(hours).toDecimalPlaces(2);

    const [updatedDevice, updatedUser, transaction] = await prisma.$transaction([
      prisma.walletDevice.update({
        where: { id: device.id },
        data: {
          offlineHoursConcession: {
            increment: Math.floor(hours),
          },
        },
      }),
      prisma.user.update({
        where: { id: device.userId },
        data: {
          balance: {
            increment: concessionAmount,
          },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: device.userId,
          deviceId: device.id,
          type: 'credit',
          amount: concessionAmount,
          balanceAfter: 0,
          description: `Fixed Bill Concession for ${device.name}: ${hours.toFixed(1)} offline hours credited.`,
        },
      }),
    ]);

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { balanceAfter: updatedUser.balance },
    });

    if (device.user.traccarId && TRACCAR_USER && TRACCAR_PASS) {
      (async () => {
        try {
          const auth = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
          const headers = { Authorization: `Basic ${auth}` };
          const traccarUserRes = await axios.get(`${TRACCAR_API_URL}/users/${device.user.traccarId}`, { headers });
          const traccarUser = traccarUserRes.data;
          await axios.put(
            `${TRACCAR_API_URL}/users/${device.user.traccarId}`,
            {
              ...traccarUser,
              attributes: {
                ...traccarUser.attributes,
                userBalance: updatedUser.balance.toNumber(),
                lastCharge: new Date().toISOString(),
              },
            },
            { headers }
          );
        } catch (err) {
          console.error(`Traccar sync failed for user ${device.userId}:`, err);
        }
      })();
    }

    return NextResponse.json({
      success: true,
      concessionAmount: concessionAmount.toNumber(),
      newBalance: updatedUser.balance.toNumber(),
    });
  } catch (error: any) {
    console.error('Fixed Bill API Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
