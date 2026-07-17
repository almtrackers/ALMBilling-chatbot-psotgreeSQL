import { NextRequest, NextResponse } from 'next/server';
import { generateInvoicesForExpiringDevices } from '@/lib/invoice-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    let adminName = 'System';
    try {
      const body = await req.json();
      if (body?.adminName) adminName = String(body.adminName);
    } catch {
      // No body — use default admin name.
    }

    const result = await generateInvoicesForExpiringDevices(adminName);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Generate expiring invoices failed:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

// Allow cron-style triggering via GET as well.
export async function GET(req: NextRequest) {
  return POST(req);
}
