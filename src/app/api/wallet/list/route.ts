import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const wallets = await prisma.user.findMany({
      include: {
        devices: true,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const serializedWallets = wallets.map(wallet => ({
      ...wallet,
      balance: wallet.balance.toNumber(),
      devices: wallet.devices.map(d => ({
        ...d,
        planPrice: d.planPrice.toNumber(),
        dailyCost: d.dailyCost.toNumber(),
      })),
      transactions: wallet.transactions.map(t => ({
        ...t,
        amount: t.amount.toNumber(),
        balanceAfter: t.balanceAfter.toNumber(),
      })),
    }));

    return NextResponse.json({ success: true, wallets: serializedWallets });
  } catch (error: any) {
    console.error('Wallet List API Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
