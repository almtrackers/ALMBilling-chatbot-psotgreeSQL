import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { isAdminRequest } from '@/lib/server-auth';
import { resolveWhatsAppMediaPath } from '@/lib/whatsapp-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serve a previously downloaded WhatsApp media file to logged-in admins.
 * URL: /api/chatbot/media?path=whatsapp-media/2026-07-27/xxx/image_123.jpg
 */
export async function GET(req: NextRequest) {
  try {
    if (!(await isAdminRequest(req))) {
      return NextResponse.json(
        { success: false, message: 'Traccar administrator login required.' },
        { status: 401 }
      );
    }

    const relativePath = req.nextUrl.searchParams.get('path') || '';
    if (!relativePath) {
      return NextResponse.json({ success: false, message: 'path is required' }, { status: 400 });
    }

    const absolutePath = resolveWhatsAppMediaPath(relativePath);
    const buffer = await fs.readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.3gp': 'video/3gpp',
      '.ogg': 'audio/ogg',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.amr': 'audio/amr',
      '.pdf': 'application/pdf',
    };

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `inline; filename="${path.basename(absolutePath)}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Media not found';
    console.error('GET /api/chatbot/media failed:', error);
    return NextResponse.json({ success: false, message }, { status: 404 });
  }
}
