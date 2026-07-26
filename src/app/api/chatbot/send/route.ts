import { NextRequest, NextResponse } from 'next/server';
import {
  sendWhatsAppMessage,
  sendWhatsAppMediaMessage,
  formatWhatsAppError,
  type OutgoingMediaKind,
} from '@/lib/whatsapp';
import { isAdminRequest } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function detectKind(mimeType: string, fileName: string): OutgoingMediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  const lower = fileName.toLowerCase();
  if (/\.(jpe?g|png|webp|gif)$/.test(lower)) return 'image';
  if (/\.(mp4|3gp|mov)$/.test(lower)) return 'video';
  if (/\.(ogg|mp3|m4a|aac|amr|wav|webm)$/.test(lower)) return 'audio';
  return 'document';
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdminRequest(req))) {
      return NextResponse.json(
        { error: 'Traccar administrator login required.' },
        { status: 401 }
      );
    }

    const contentType = req.headers.get('content-type') || '';

    // Multipart media upload from the live-chat agent inbox.
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const to = String(form.get('to') || '').trim();
      const caption = String(form.get('caption') || form.get('message') || '').trim();
      const file = form.get('file');

      if (!to || !(file instanceof File) || file.size === 0) {
        return NextResponse.json(
          { error: 'Missing recipient or media file' },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || 'application/octet-stream';
      const fileName = file.name || `media-${Date.now()}`;
      const kind = detectKind(mimeType, fileName);

      const result = await sendWhatsAppMediaMessage(to, buffer, {
        kind,
        fileName,
        mimeType,
        caption: caption || undefined,
      });

      if (result.success) {
        return NextResponse.json({ success: true, data: result.data, kind });
      }
      return NextResponse.json(
        { error: formatWhatsAppError(result.error) },
        { status: 500 }
      );
    }

    const { to, message } = await req.json();
    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 });
    }

    const result = await sendWhatsAppMessage(to, message);
    if (result.success) {
      return NextResponse.json({ success: true, data: result.data });
    }
    return NextResponse.json(
      { error: formatWhatsAppError(result.error) },
      { status: 500 }
    );
  } catch (error: unknown) {
    console.error('API Error in /api/chatbot/send:', error);
    return NextResponse.json(
      { error: formatWhatsAppError(error) },
      { status: 500 }
    );
  }
}
