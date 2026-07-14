import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import axios from 'axios';
import { addMonths, addYears } from 'date-fns';

const TRACCAR_API_URL = process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

export async function POST(req: NextRequest) {
  try {
    const {
      contactNumber,
      customerName,
      amount,
      description,
      traccarDeviceId,
      planType,
      planPrice,
      vehicleNumber,
      traccarUserId,
    } = await req.json();

    if (!contactNumber) {
      return NextResponse.json({ success: false, message: 'Contact number is required.' }, { status: 400 });
    }

    let user = await prisma.user.findUnique({
      where: { phone: contactNumber },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: contactNumber,
          name: customerName || 'New Customer',
          balance: 0,
          status: 'active',
          traccarId: traccarUserId ? Number(traccarUserId) : null,
        },
      });
    } else if (traccarUserId && !user.traccarId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { traccarId: Number(traccarUserId) },
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        balance: {
          increment: new Decimal(amount),
        },
      },
    });

    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: Number(amount) >= 0 ? 'credit' : 'debit',
        amount: new Decimal(Math.abs(Number(amount))),
        balanceAfter: updatedUser.balance,
        description: description || `Wallet update for ${vehicleNumber || customerName || 'User'}`,
      },
    });

    if (traccarDeviceId && planType && planPrice) {
      const dailyCost = planType === 'yearly'
        ? new Decimal(planPrice).dividedBy(365)
        : new Decimal(planPrice).dividedBy(30);

      let nextBillingDate: Date;
      const now = new Date();
      if (planType === 'monthly') {
        const nextMonth = addMonths(now, 1);
        nextBillingDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
      } else {
        const nextYear = addYears(now, 1);
        nextBillingDate = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59);
      }

      await prisma.walletDevice.upsert({
        where: { traccarDeviceId: Number(traccarDeviceId) },
        update: {
          userId: user.id,
          name: vehicleNumber,
          planType,
          planPrice: new Decimal(planPrice),
          dailyCost,
          nextBillingDate,
          status: 'active',
        },
        create: {
          userId: user.id,
          traccarDeviceId: Number(traccarDeviceId),
          name: vehicleNumber,
          planType,
          planPrice: new Decimal(planPrice),
          dailyCost,
          billingStartDate: new Date(),
          nextBillingDate,
          status: 'active',
        },
      });
    }

    if (user.traccarId && TRACCAR_USER && TRACCAR_PASS) {
      try {
        const auth = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64');
        const userRes = await axios.get(`${TRACCAR_API_URL}/users/${user.traccarId}`, {
          headers: { Authorization: `Basic ${auth}` },
        });

        const traccarUser = userRes.data;
        await axios.put(
          `${TRACCAR_API_URL}/users/${user.traccarId}`,
          {
            ...traccarUser,
            attributes: {
              ...traccarUser.attributes,
              userBalance: updatedUser.balance.toNumber(),
              lastCharge: new Date().toISOString(),
            },
          },
          { headers: { Authorization: `Basic ${auth}` } }
        );
      } catch (traccarError: any) {
        console.error('Failed to sync with Traccar attributes:', traccarError.response?.data || traccarError.message);
      }
    }

    return NextResponse.json({
      success: true,
      balance: updatedUser.balance.toNumber(),
      message: `Wallet updated for ${customerName}. New balance: ${updatedUser.balance.toNumber()}`,
    });
  } catch (error: any) {
    console.error('Wallet Update API Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
