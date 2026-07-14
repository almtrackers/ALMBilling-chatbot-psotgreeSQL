import { NextResponse } from 'next/server';
import { syncRegistrationNumbersFromTraccar } from '@/lib/traccar-sync';

/**
 * Syncs Traccar users/devices and saves registration numbers into PostgreSQL from:
 * - Traccar username (when it is a phone number)
 * - Traccar user phone
 * - Device phoneRobocall attributes
 * - Sales phoneRobocall / contactNumber
 */
export async function POST() {
  try {
    const stats = await syncRegistrationNumbersFromTraccar();
    return NextResponse.json({
      success: true,
      message: `Synced ${stats.registrationNumbersSaved} registration number(s) into PostgreSQL.`,
      stats,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('Registration number sync failed:', error);
    return NextResponse.json(
      { success: false, message: err.message || 'Failed to sync registration numbers.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
