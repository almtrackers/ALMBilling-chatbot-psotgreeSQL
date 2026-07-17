import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { addMonths, addYears } from 'date-fns';
import { WALLET_AUTO_PAY_BY } from '@/lib/wallet-sync';

export const dynamic = 'force-dynamic';

type PeriodRow = {
  periodNumber: number;
  start: string;
  end: string;
  fee: number;
  status: 'free' | 'charged' | 'upcoming';
};

export async function GET(req: NextRequest) {
  try {
    const userId = Number(req.nextUrl.searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ success: false, message: 'userId is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        devices: true,
        transactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!user) {
      return NextResponse.json({ success: false, message: 'Wallet not found' }, { status: 404 });
    }

    const now = new Date();

    const devices = user.devices.map((device) => {
      const addPeriod = device.planType === 'yearly' ? addYears : addMonths;
      const fee = device.planPrice.toNumber();
      const periods: PeriodRow[] = [];

      let start = new Date(device.billingStartDate);
      let periodNumber = 1;
      // List every period from installation through the current one (+1 upcoming).
      while (start <= now && periodNumber <= 240) {
        const end = addPeriod(start, 1);
        periods.push({
          periodNumber,
          start: start.toISOString(),
          end: end.toISOString(),
          fee: periodNumber === 1 ? 0 : fee,
          status: periodNumber === 1 ? 'free' : 'charged',
        });
        start = end;
        periodNumber += 1;
      }
      periods.push({
        periodNumber,
        start: start.toISOString(),
        end: addPeriod(start, 1).toISOString(),
        fee,
        status: 'upcoming',
      });

      const chargedTotal = periods
        .filter((p) => p.status === 'charged')
        .reduce((sum, p) => sum + p.fee, 0);

      return {
        id: device.id,
        traccarDeviceId: device.traccarDeviceId,
        name: device.name,
        planType: device.planType,
        planPrice: fee,
        status: device.status,
        installationDate: device.billingStartDate.toISOString(),
        nextBillingDate: device.nextBillingDate.toISOString(),
        chargedPeriods: periods.filter((p) => p.status === 'charged').length,
        chargedTotal,
        periods,
      };
    });

    const transactions = user.transactions.map((tx) => ({
      id: tx.id,
      deviceId: tx.deviceId,
      type: tx.type,
      amount: tx.amount.toNumber(),
      balanceAfter: tx.balanceAfter.toNumber(),
      description: tx.description,
      createdAt: tx.createdAt.toISOString(),
    }));

    const invoices = user.traccarId
      ? await prisma.invoice.findMany({
          where: { customerIdentifier: String(user.traccarId) },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const totalDebits = transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalCredits = transactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    const autoPaidTotal = transactions
      .filter((t) => t.type === 'auto-pay')
      .reduce((sum, t) => sum + t.amount, 0);
    const pendingInvoicesTotal = invoices
      .filter((inv) => inv.status === 'pending')
      .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

    return NextResponse.json({
      success: true,
      wallet: {
        id: user.id,
        traccarId: user.traccarId,
        name: user.name,
        phone: user.phone,
        email: user.email,
        status: user.status,
        balance: user.balance.toNumber(),
      },
      summary: {
        totalDebits,
        totalCredits,
        balance: user.balance.toNumber(),
        autoPaidTotal,
        pendingInvoicesTotal,
        deviceCount: devices.length,
        transactionCount: transactions.length,
      },
      devices,
      transactions,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        customerName: inv.customerName,
        totalAmount: inv.totalAmount,
        status: inv.status,
        periodStart: inv.periodStart.toISOString(),
        periodEnd: inv.periodEnd.toISOString(),
        paidAt: inv.paidAt?.toISOString() || null,
        paidBy: inv.paidBy,
        autoPaid: inv.paidBy === WALLET_AUTO_PAY_BY,
        createdAt: inv.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error('Wallet Statement API Error:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to load statement' },
      { status: 500 }
    );
  }
}
