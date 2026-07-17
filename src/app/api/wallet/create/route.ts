import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { traccarClient } from '@/lib/traccar-client';
import { recalculateWallet } from '@/lib/wallet-sync';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * Manually create a wallet. This is the only way to create wallets for
 * admin/manager Traccar accounts — the automatic sync skips them.
 */
export async function POST(req: NextRequest) {
  try {
    const { traccarId, name, phone, email } = await req.json();

    if (!traccarId && !name) {
      return NextResponse.json(
        { success: false, message: 'Provide a Traccar user or at least a name.' },
        { status: 400 }
      );
    }

    let resolvedName = name || '';
    let resolvedEmail = email || null;
    let resolvedPhone = phone || null;

    if (traccarId) {
      const existing = await prisma.user.findUnique({ where: { traccarId: Number(traccarId) } });
      if (existing) {
        return NextResponse.json(
          { success: false, message: `A wallet already exists for this Traccar user (${existing.name}).` },
          { status: 409 }
        );
      }

      if (!resolvedName || !resolvedEmail) {
        try {
          const res = await traccarClient.get(`/users/${Number(traccarId)}`);
          const tUser = Array.isArray(res.data) ? res.data[0] : res.data;
          resolvedName = resolvedName || tUser?.name || `Traccar User ${traccarId}`;
          resolvedEmail = resolvedEmail || tUser?.email || null;
          resolvedPhone = resolvedPhone || tUser?.phone || null;
        } catch {
          resolvedName = resolvedName || `Traccar User ${traccarId}`;
        }
      }
    }

    if (resolvedPhone) {
      const byPhone = await prisma.user.findUnique({ where: { phone: resolvedPhone } });
      if (byPhone) {
        return NextResponse.json(
          { success: false, message: `A wallet with phone ${resolvedPhone} already exists (${byPhone.name}).` },
          { status: 409 }
        );
      }
    }

    const user = await prisma.user.create({
      data: {
        traccarId: traccarId ? Number(traccarId) : null,
        name: resolvedName,
        email: resolvedEmail,
        phone: resolvedPhone,
        status: 'active',
      },
    });

    const sessionUser = await getSessionUser(req);
    await prisma.log.create({
      data: {
        action: `Created wallet for ${resolvedName} (wallet #${user.id}${traccarId ? `, Traccar user ${traccarId}` : ''})`,
        adminName: sessionUser?.name || sessionUser?.email || 'Admin',
        type: 'create',
      },
    });

    // Build the initial ledger right away (devices, subscription debits, invoice credits).
    let balance = 0;
    try {
      const result = await recalculateWallet(user.id);
      balance = result.balance;
    } catch (err) {
      console.error(`Initial recalculation failed for wallet ${user.id}:`, err);
    }

    return NextResponse.json({
      success: true,
      wallet: { id: user.id, name: user.name, traccarId: user.traccarId, balance },
    });
  } catch (error: unknown) {
    console.error('Wallet Create API Error:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to create wallet' },
      { status: 500 }
    );
  }
}
