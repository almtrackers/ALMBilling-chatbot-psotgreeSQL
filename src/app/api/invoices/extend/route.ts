
import { NextRequest, NextResponse } from 'next/server';
import { grantInvoiceExtension } from '@/lib/invoice-service';
import { Device } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { invoiceId, extensionDays, devices } = await req.json();

    if (!invoiceId || extensionDays === undefined || !devices) {
      return NextResponse.json(
        { error: 'invoiceId, extensionDays, and devices are required' },
        { status: 400 }
      );
    }

    await grantInvoiceExtension(invoiceId, extensionDays, devices as Device[]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/invoices/extend - Error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}
