import { NextResponse } from 'next/server';
import { syncWalletsAndRecalculate } from '@/lib/wallet-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  try {
    const stats = await syncWalletsAndRecalculate();
    return NextResponse.json({ success: true, stats });
  } catch (error: unknown) {
    console.error('Wallet Sync API Error:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Wallet sync failed' },
      { status: 500 }
    );
  }
}

// Allow cron-style triggering via GET as well.
export async function GET() {
  return POST();
}
