import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const { to, message } = await req.json();

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 });
    }

    const result = await sendWhatsAppMessage(to, message);

    if (result.success) {
      return NextResponse.json({ success: true, data: result.data });
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('API Error in /api/chatbot/send:', error);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
