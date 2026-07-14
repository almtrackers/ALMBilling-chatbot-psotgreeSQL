
import { NextRequest, NextResponse } from 'next/server';
import { generateInvoicesFromTraccar } from '@/lib/invoice-service';

export async function POST(req: NextRequest) {
  try {
    const { adminName, force } = await req.json();

    if (!adminName) {
      return NextResponse.json(
        { error: 'adminName is required' },
        { status: 400 }
      );
    }

    await generateInvoicesFromTraccar(adminName, force || false);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/invoices/generate - Error:', error);
    return NextResponse.json(
      { error: error.message || 'Unknown server error' },
      { status: 500 }
    );
  }
}
