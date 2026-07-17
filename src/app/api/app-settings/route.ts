import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma/client';
import { parseJsonField } from '@/lib/db/serialize';

function formatSettings(settings: {
  soundEvents: string | null;
  soundAlarms: string | null;
  securityPin?: string | null;
  [key: string]: unknown;
}) {
  // Never expose the raw PIN to the client — only whether one is set.
  const { securityPin, ...rest } = settings;
  return {
    ...rest,
    hasSecurityPin: Boolean(securityPin),
    soundEvents: parseJsonField<string[]>(settings.soundEvents, ['alarm']),
    soundAlarms: parseJsonField<string[]>(settings.soundAlarms, []),
  };
}

export async function GET(req: NextRequest) {
  try {
    let settings = await prisma.appSetting.findUnique({
      where: { id: 'main' },
    });
    
    if (!settings) {
      settings = await prisma.appSetting.create({
        data: {
          id: 'main',
          theme: 'light',
          invoiceDaysMonthly: 3,
          invoiceDaysYearly: 7,
          simCostPerDevice: 150,
          monthlyYearlyThreshold: 2000,
        },
      });
    }
    
    return NextResponse.json(formatSettings(settings));
  } catch (error: any) {
    console.error('App Settings GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const soundEvents =
      data.soundEvents !== undefined ? JSON.stringify(data.soundEvents) : undefined;
    const soundAlarms =
      data.soundAlarms !== undefined ? JSON.stringify(data.soundAlarms) : undefined;
    // Only touch the PIN when explicitly sent: non-empty sets it, empty string clears it.
    // Stored bcrypt-hashed — the raw PIN never touches the database.
    const securityPin =
      typeof data.securityPin === 'string'
        ? data.securityPin.trim() === ''
          ? null
          : await hash(data.securityPin.trim(), 12)
        : undefined;

    const settings = await prisma.appSetting.upsert({
      where: { id: 'main' },
      update: {
        theme: data.theme,
        invoiceDaysMonthly: data.invoiceDaysMonthly,
        invoiceDaysYearly: data.invoiceDaysYearly,
        simCostPerDevice: data.simCostPerDevice,
        monthlyYearlyThreshold: data.monthlyYearlyThreshold,
        walletAutoPayEnabled: data.walletAutoPayEnabled,
        securityPin,
        soundEvents,
        soundAlarms,
      },
      create: {
        id: 'main',
        theme: data.theme || 'light',
        invoiceDaysMonthly: data.invoiceDaysMonthly || 3,
        invoiceDaysYearly: data.invoiceDaysYearly || 7,
        simCostPerDevice: data.simCostPerDevice || 150,
        monthlyYearlyThreshold: data.monthlyYearlyThreshold || 2000,
        walletAutoPayEnabled: data.walletAutoPayEnabled ?? true,
        securityPin: securityPin ?? null,
        soundEvents: soundEvents ?? JSON.stringify(['alarm']),
        soundAlarms: soundAlarms ?? JSON.stringify([]),
      },
    });
    return NextResponse.json(formatSettings(settings));
  } catch (error: any) {
    console.error('App Settings POST Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
