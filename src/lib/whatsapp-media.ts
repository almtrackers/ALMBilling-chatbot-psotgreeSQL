import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { uploadsRoot } from '@/lib/client-documents/paths';

export type IncomingMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export type SavedWhatsAppMedia = {
  kind: IncomingMediaKind;
  relativePath: string;
  mimeType: string;
  fileName: string;
  caption: string | null;
  whatsappMediaId: string;
};

function getWhatsAppConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v23.0';
  if (!token) return null;
  return { token, apiVersion };
}

function extensionForMime(mimeType: string, kind: IncomingMediaKind): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'audio/amr': '.amr',
    'application/pdf': '.pdf',
  };
  if (map[mimeType]) return map[mimeType];
  if (kind === 'image') return '.jpg';
  if (kind === 'video') return '.mp4';
  if (kind === 'audio') return '.ogg';
  if (kind === 'document') return '.bin';
  return '.bin';
}

/**
 * Download a WhatsApp Cloud API media object and save it under uploads/whatsapp-media/.
 */
export async function downloadAndSaveWhatsAppMedia(options: {
  mediaId: string;
  kind: IncomingMediaKind;
  caption?: string | null;
  phoneNumber?: string;
}): Promise<SavedWhatsAppMedia> {
  const config = getWhatsAppConfig();
  if (!config) {
    throw new Error('WhatsApp configuration missing (WHATSAPP_TOKEN).');
  }

  const metaRes = await axios.get(
    `https://graph.facebook.com/${config.apiVersion}/${options.mediaId}`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
    }
  );

  const mediaUrl = metaRes.data?.url as string | undefined;
  const mimeType = String(metaRes.data?.mime_type || 'application/octet-stream');
  if (!mediaUrl) {
    throw new Error('WhatsApp media URL was not returned.');
  }

  const fileRes = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${config.token}` },
    responseType: 'arraybuffer',
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const buffer = Buffer.from(fileRes.data);
  const day = new Date().toISOString().slice(0, 10);
  const phoneSafe = (options.phoneNumber || 'unknown').replace(/\D/g, '').slice(-12) || 'unknown';
  const relativeDir = path.posix.join('whatsapp-media', day, phoneSafe);
  const absDir = path.join(uploadsRoot(), relativeDir);
  await fs.mkdir(absDir, { recursive: true });

  const ext = extensionForMime(mimeType, options.kind);
  const fileName = `${options.kind}_${options.mediaId}${ext}`;
  const absolutePath = path.join(absDir, fileName);
  await fs.writeFile(absolutePath, buffer);

  return {
    kind: options.kind,
    relativePath: path.posix.join(relativeDir, fileName),
    mimeType,
    fileName,
    caption: options.caption?.trim() || null,
    whatsappMediaId: options.mediaId,
  };
}

export function resolveWhatsAppMediaPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    !normalized.startsWith('whatsapp-media/') ||
    normalized.includes('..') ||
    normalized.includes('\0')
  ) {
    throw new Error('Invalid media path');
  }
  const absolute = path.resolve(uploadsRoot(), normalized);
  const root = path.resolve(uploadsRoot());
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw new Error('Invalid media path');
  }
  return absolute;
}

/**
 * Extract media metadata from a WhatsApp Cloud API message object.
 */
export function extractIncomingMedia(message: any): {
  kind: IncomingMediaKind;
  mediaId: string;
  caption: string | null;
} | null {
  if (!message?.type) return null;

  if (message.type === 'image' && message.image?.id) {
    return {
      kind: 'image',
      mediaId: String(message.image.id),
      caption: message.image.caption || null,
    };
  }
  if (message.type === 'video' && message.video?.id) {
    return {
      kind: 'video',
      mediaId: String(message.video.id),
      caption: message.video.caption || null,
    };
  }
  if ((message.type === 'audio' || message.type === 'voice') && message.audio?.id) {
    return {
      kind: 'audio',
      mediaId: String(message.audio.id),
      caption: null,
    };
  }
  if (message.type === 'document' && message.document?.id) {
    return {
      kind: 'document',
      mediaId: String(message.document.id),
      caption: message.document.caption || message.document.filename || null,
    };
  }
  if (message.type === 'sticker' && message.sticker?.id) {
    return {
      kind: 'sticker',
      mediaId: String(message.sticker.id),
      caption: null,
    };
  }
  return null;
}

export function mediaBodyLabel(kind: IncomingMediaKind, caption?: string | null): string {
  const labels: Record<IncomingMediaKind, string> = {
    image: '📷 Image',
    video: '🎬 Video',
    audio: '🎤 Voice message',
    document: '📄 Document',
    sticker: '🎨 Sticker',
  };
  const base = labels[kind] || '📎 Media';
  return caption ? `${base}\n${caption}` : base;
}

/** Save an outgoing agent media file for inbox preview. */
export async function saveOutgoingAgentMedia(options: {
  buffer: Buffer;
  kind: 'image' | 'video' | 'audio' | 'document';
  fileName: string;
  mimeType: string;
  phoneNumber?: string;
}): Promise<{ relativePath: string; mimeType: string; kind: string }> {
  const day = new Date().toISOString().slice(0, 10);
  const phoneSafe = (options.phoneNumber || 'unknown').replace(/\D/g, '').slice(-12) || 'unknown';
  const relativeDir = path.posix.join('whatsapp-media', day, phoneSafe, 'outgoing');
  const absDir = path.join(uploadsRoot(), relativeDir);
  await fs.mkdir(absDir, { recursive: true });

  const safeName = options.fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || `${options.kind}.bin`;
  const stamp = Date.now();
  const fileName = `${options.kind}_${stamp}_${safeName}`;
  const absolutePath = path.join(absDir, fileName);
  await fs.writeFile(absolutePath, options.buffer);

  return {
    kind: options.kind,
    relativePath: path.posix.join(relativeDir, fileName),
    mimeType: options.mimeType,
  };
}
