import { NextResponse } from 'next/server';
import { syncRegistrationNumbersFromTraccar } from '@/lib/traccar-sync';

export async function POST() {
  try {
    const stats = await syncRegistrationNumbersFromTraccar();
    return NextResponse.json({
      success: true,
      count: stats.usersSynced,
      message: `Synced users and ${stats.registrationNumbersSaved} registration number(s).`,
      stats,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('Sync API Error:', error);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
