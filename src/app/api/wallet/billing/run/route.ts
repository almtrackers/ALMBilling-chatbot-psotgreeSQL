import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import axios from 'axios';
import { differenceInHours, addMonths, addYears } from 'date-fns';
import { Decimal } from '@prisma/client/runtime/library';

const TRACCAR_API_URL = process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

export async function GET(req: NextRequest) {
  try {
    if (!TRACCAR_USER || !TRACCAR_PASS) {
      return NextResponse.json({ success: false, message: 'Traccar credentials missing' }, { status: 500 });
    }

    const auth = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };

    const now = new Date();
    const devicesDue = await prisma.walletDevice.findMany({
      where: {
        status: 'active',
        nextBillingDate: {
          lte: now,
        },
      },
      include: {
        user: true,
      },
    });

    const results = [];

    for (const device of devicesDue) {
      try {
        const periodStart = device.lastChargedAt || device.billingStartDate;
        const periodEnd = now;

        let totalOfflineHours = 0;
        try {
          const eventsRes = await axios.get(`${TRACCAR_API_URL}/reports/events`, {
            headers: { Authorization: `Basic ${auth}` },
            params: {
              deviceId: device.traccarDeviceId,
              from: periodStart.toISOString(),
              to: periodEnd.toISOString(),
              type: 'deviceOnline,deviceOffline',
            },
          });

          const events = eventsRes.data;
          let lastOfflineTime: Date | null = null;
          events.sort((a: any, b: any) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

          for (const event of events) {
            const eventTime = new Date(event.eventTime);
            if (event.type === 'deviceOffline') {
              lastOfflineTime = eventTime;
            } else if (event.type === 'deviceOnline' && lastOfflineTime) {
              const offlineDuration = differenceInHours(eventTime, lastOfflineTime);
              if (offlineDuration >= 96) {
                totalOfflineHours += offlineDuration;
              }
              lastOfflineTime = null;
            }
          }
          if (lastOfflineTime) {
            const offlineDuration = differenceInHours(periodEnd, lastOfflineTime);
            if (offlineDuration >= 96) {
              totalOfflineHours += offlineDuration;
            }
          }
        } catch (err) {
          console.error(`Failed to fetch events for device ${device.id}:`, err);
        }

        const hourlyCost = new Decimal(device.dailyCost).div(24);
        const effectiveAutoOfflineHours = Math.max(0, totalOfflineHours - device.offlineHoursConcession);
        const autoConcessionAmount = hourlyCost.mul(effectiveAutoOfflineHours).toDecimalPlaces(2);
        const billableAmount = new Decimal(device.planPrice).minus(autoConcessionAmount);

        const [updatedUser, transaction] = await prisma.$transaction([
          prisma.user.update({
            where: { id: device.userId },
            data: {
              balance: {
                decrement: billableAmount,
              },
            },
          }),
          prisma.transaction.create({
            data: {
              userId: device.userId,
              deviceId: device.id,
              type: 'debit',
              amount: billableAmount,
              balanceAfter: 0,
              description: `Renewal fee for ${device.name} (${device.planType}).${effectiveAutoOfflineHours > 0 ? ` Included ${effectiveAutoOfflineHours.toFixed(1)}h automatic offline concession.` : ''}${device.offlineHoursConcession > 0 ? ` (${device.offlineHoursConcession}h were already manually credited).` : ''}`,
            },
          }),
          prisma.walletDevice.update({
            where: { id: device.id },
            data: {
              lastChargedAt: now,
              nextBillingDate: device.planType === 'monthly' ? addMonths(device.nextBillingDate, 1) : addYears(device.nextBillingDate, 1),
              offlineHoursConcession: 0,
            },
          }),
        ]);

        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { balanceAfter: updatedUser.balance },
        });

        if (device.user.traccarId) {
          try {
            const traccarUserRes = await axios.get(`${TRACCAR_API_URL}/users/${device.user.traccarId}`, { headers });
            const traccarUser = traccarUserRes.data;
            await axios.put(
              `${TRACCAR_API_URL}/users/${device.user.traccarId}`,
              {
                ...traccarUser,
                attributes: {
                  ...traccarUser.attributes,
                  userBalance: updatedUser.balance.toNumber(),
                  lastCharge: now.toISOString(),
                },
              },
              { headers }
            );
          } catch (err) {
            console.error(`Traccar sync failed for user ${device.userId}:`, err);
          }
        }

        results.push({
          deviceId: device.id,
          name: device.name,
          billableAmount: billableAmount.toNumber(),
          success: true,
        });
      } catch (deviceError: any) {
        console.error(`Error billing device ${device.id}:`, deviceError);
        results.push({
          deviceId: device.id,
          name: device.name,
          error: deviceError.message,
          success: false,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: devicesDue.length,
      results,
    });
  } catch (error: any) {
    console.error('Billing Run API Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
