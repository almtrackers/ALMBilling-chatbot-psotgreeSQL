
import { NextRequest, NextResponse } from 'next/server';
import { checkAndAutoCallInvoiceReminders } from '@/lib/invoice-service';

export async function POST(req: NextRequest) {
  try {
    const { adminName } = await req.json();

    if (!adminName) {
      return NextResponse.json(
        { error: 'adminName is required' },
        { status: 400 }
      );
    }

    await checkAndAutoCallInvoiceReminders(adminName);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/invoices/reminders/autocall - Error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}
