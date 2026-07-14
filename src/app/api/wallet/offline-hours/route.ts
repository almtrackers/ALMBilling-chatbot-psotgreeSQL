import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import axios from 'axios';
import { differenceInHours } from 'date-fns';

const TRACCAR_API_URL = process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json({ success: false, message: 'Device ID is required' }, { status: 400 });
    }

    if (!TRACCAR_USER || !TRACCAR_PASS) {
      return NextResponse.json({ success: false, message: 'Traccar credentials missing' }, { status: 500 });
    }

    const auth = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };

    const walletDevice = await prisma.walletDevice.findUnique({
      where: { id: parseInt(deviceId) },
    });

    if (!walletDevice) {
      return NextResponse.json({ success: false, message: 'Wallet device not found' }, { status: 404 });
    }

    const fromDate = walletDevice.lastChargedAt || walletDevice.billingStartDate;
    const toDate = new Date();

    const eventsRes = await axios.get(`${TRACCAR_API_URL}/reports/events`, {
      headers,
      params: {
        deviceId: walletDevice.traccarDeviceId,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        type: 'deviceOnline,deviceOffline',
      },
    });

    const events = eventsRes.data;
    let totalOfflineHours = 0;
    let total96PlusOfflineHours = 0;
    let lastOfflineTime: Date | null = null;

    events.sort((a: any, b: any) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

    for (const event of events) {
      const eventTime = new Date(event.eventTime);
      if (event.type === 'deviceOffline') {
        lastOfflineTime = eventTime;
      } else if (event.type === 'deviceOnline' && lastOfflineTime) {
        const offlineDuration = differenceInHours(eventTime, lastOfflineTime);
        totalOfflineHours += offlineDuration;
        if (offlineDuration >= 96) {
          total96PlusOfflineHours += offlineDuration;
        }
        lastOfflineTime = null;
      }
    }

    if (lastOfflineTime) {
      const offlineDuration = differenceInHours(toDate, lastOfflineTime);
      totalOfflineHours += offlineDuration;
      if (offlineDuration >= 96) {
        total96PlusOfflineHours += offlineDuration;
      }
    }

    return NextResponse.json({
      success: true,
      totalOfflineHours,
      total96PlusOfflineHours,
      periodStart: fromDate,
      periodEnd: toDate,
    });
  } catch (error: any) {
    console.error('Offline Hours API Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
