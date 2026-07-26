import axios from 'axios';
import prisma from './prisma/client';
import { getPhoneLookupVariants, normalizePhoneNumber } from './utils';

type SendWhatsAppOptions = {
  ignoreOptOut?: boolean;
};

/** Turn Graph API / axios error payloads into a readable string. */
export function formatWhatsAppError(error: unknown): string {
  if (!error) return 'Unknown WhatsApp error';
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;

  const asRecord = error as {
    error?: { message?: string; error_user_msg?: string; error_data?: { details?: string }; code?: number };
    message?: string;
  };

  const nested = asRecord.error;
  if (nested) {
    return (
      nested.error_user_msg ||
      nested.error_data?.details ||
      nested.message ||
      (nested.code ? `WhatsApp error ${nested.code}` : 'WhatsApp API error')
    );
  }

  if (typeof asRecord.message === 'string') return asRecord.message;

  try {
    return JSON.stringify(error);
  } catch {
    return 'WhatsApp API error';
  }
}

export async function sendWhatsAppMessage(to: string, message: string, options?: SendWhatsAppOptions) {
  const normalized = normalizePhoneNumber(to);
  const phoneNumber = normalized.local || normalized.digits || normalized.raw;
  const recipientNumber = normalized.international || normalized.digits || normalized.raw;
  const lookupVariants = getPhoneLookupVariants(to);
  const shouldIgnoreOptOut = options?.ignoreOptOut === true;

  if (!shouldIgnoreOptOut) {
    const session = await prisma.userSession.findFirst({
      where: { phoneNumber: { in: lookupVariants } },
      select: { lastAction: true },
    });

    if (session?.lastAction === 'OPTED_OUT') {
      await logOutgoingMessage(phoneNumber, message, 'skipped-optout');
      return { success: false, skipped: true, error: 'Recipient opted out' };
    }
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v23.0';

  if (!token || !phoneNumberId) {
    console.error('WhatsApp configuration missing: WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    await logOutgoingMessage(phoneNumber, message, 'failed (missing config)');
    return { success: false, error: 'WhatsApp configuration missing' };
  }

  try {
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientNumber,
        type: 'text',
        text: {
          body: message,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const messageId = response.data.messages?.[0]?.id;
    await logOutgoingMessage(recipientNumber, message, 'sent', messageId);
    return { success: true, data: response.data };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Failed to send WhatsApp message:', err.response?.data || err.message);
    await logOutgoingMessage(recipientNumber, message, 'failed');
    return { success: false, error: err.response?.data || err.message };
  }
}

async function logOutgoingMessage(
  to: string,
  body: string,
  status: string,
  messageId?: string,
  media?: { mediaType: string; mediaPath: string; mediaMime: string }
) {
  try {
    await prisma.webhookLog.create({
      data: {
        type: 'outgoing',
        from: 'Agent',
        to: to,
        body: body,
        status: status,
        messageId: messageId,
        mediaType: media?.mediaType,
        mediaPath: media?.mediaPath,
        mediaMime: media?.mediaMime,
      },
    });
  } catch (err) {
    console.error('Failed to log outgoing message to database:', err);
  }
}

function getWhatsAppConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v23.0';
  if (!token || !phoneNumberId) {
    return null;
  }
  return { token, phoneNumberId, apiVersion };
}

async function uploadWhatsAppMedia(buffer: Buffer, fileName: string, mimeType: string) {
  const config = getWhatsAppConfig();
  if (!config) {
    throw new Error('WhatsApp configuration missing');
  }

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    fileName
  );

  const response = await axios.post(
    `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  );

  const mediaId = response.data?.id as string | undefined;
  if (!mediaId) {
    throw new Error('WhatsApp media upload did not return an id');
  }
  return mediaId;
}

export async function sendWhatsAppDocument(
  to: string,
  buffer: Buffer,
  fileName: string,
  options?: SendWhatsAppOptions & { caption?: string; mimeType?: string }
) {
  const normalized = normalizePhoneNumber(to);
  const phoneNumber = normalized.local || normalized.digits || normalized.raw;
  const recipientNumber = normalized.international || normalized.digits || normalized.raw;
  const lookupVariants = getPhoneLookupVariants(to);
  const shouldIgnoreOptOut = options?.ignoreOptOut === true;
  const mimeType = options?.mimeType || 'application/pdf';
  const caption = options?.caption;
  const logBody = caption ? `[document:${fileName}] ${caption}` : `[document:${fileName}]`;

  if (!shouldIgnoreOptOut) {
    const session = await prisma.userSession.findFirst({
      where: { phoneNumber: { in: lookupVariants } },
      select: { lastAction: true },
    });

    if (session?.lastAction === 'OPTED_OUT') {
      await logOutgoingMessage(phoneNumber, logBody, 'skipped-optout');
      return { success: false, skipped: true, error: 'Recipient opted out' };
    }
  }

  const config = getWhatsAppConfig();
  if (!config) {
    console.error('WhatsApp configuration missing: WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
    await logOutgoingMessage(phoneNumber, logBody, 'failed (missing config)');
    return { success: false, error: 'WhatsApp configuration missing' };
  }

  try {
    const mediaId = await uploadWhatsAppMedia(buffer, fileName, mimeType);
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientNumber,
        type: 'document',
        document: {
          id: mediaId,
          filename: fileName,
          ...(caption ? { caption } : {}),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const messageId = response.data.messages?.[0]?.id;
    await logOutgoingMessage(recipientNumber, logBody, 'sent', messageId);
    return { success: true, data: response.data };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Failed to send WhatsApp document:', err.response?.data || err.message);
    await logOutgoingMessage(recipientNumber, logBody, 'failed');
    return { success: false, error: err.response?.data || err.message };
  }
}

export type OutgoingMediaKind = 'image' | 'video' | 'audio' | 'document';

/**
 * Send image / video / voice / document from an agent to a WhatsApp user.
 * Also saves a local copy so the live-chat inbox can preview the outgoing media.
 */
export async function sendWhatsAppMediaMessage(
  to: string,
  inputBuffer: Buffer,
  options: SendWhatsAppOptions & {
    kind: OutgoingMediaKind;
    fileName: string;
    mimeType: string;
    caption?: string;
  }
) {
  const { saveOutgoingAgentMedia } = await import('@/lib/whatsapp-media');
  const normalized = normalizePhoneNumber(to);
  const phoneNumber = normalized.local || normalized.digits || normalized.raw;
  const recipientNumber = normalized.international || normalized.digits || normalized.raw;
  const lookupVariants = getPhoneLookupVariants(to);
  const shouldIgnoreOptOut = options.ignoreOptOut === true;
  let kind = options.kind;
  let mimeType = options.mimeType || 'application/octet-stream';
  let fileName = options.fileName || `media-${Date.now()}`;
  let buffer = inputBuffer;

  // Browser mic recordings are usually audio/webm — WhatsApp rejects that entirely.
  // Convert to OGG/Opus (or MP3) before upload.
  if (kind === 'audio' && !isWhatsAppNativeAudio(mimeType)) {
    const { convertAudioForWhatsApp } = await import('@/lib/audio-convert');
    const converted = await convertAudioForWhatsApp(buffer, mimeType);
    buffer = converted.buffer;
    mimeType = converted.mimeType;
    fileName = converted.fileName;
  }

  // Prefer a WhatsApp-friendly OGG content-type for Opus voice notes.
  if (kind === 'audio' && mimeType.toLowerCase().includes('ogg')) {
    mimeType = 'audio/ogg';
    if (!fileName.toLowerCase().endsWith('.ogg')) {
      fileName = `${fileName.replace(/\.[^.]+$/, '')}.ogg`;
    }
  }

  const caption = options.caption?.trim() || undefined;
  const labels: Record<OutgoingMediaKind, string> = {
    image: '📷 Image',
    video: '🎬 Video',
    audio: '🎤 Voice message',
    document: '📄 Document',
  };
  const logBody = caption ? `${labels[kind]}\n${caption}` : labels[kind];

  if (!shouldIgnoreOptOut) {
    const session = await prisma.userSession.findFirst({
      where: { phoneNumber: { in: lookupVariants } },
      select: { lastAction: true },
    });
    if (session?.lastAction === 'OPTED_OUT') {
      await logOutgoingMessage(phoneNumber, logBody, 'skipped-optout');
      return { success: false, skipped: true, error: 'Recipient opted out' };
    }
  }

  const config = getWhatsAppConfig();
  if (!config) {
    await logOutgoingMessage(phoneNumber, logBody, 'failed (missing config)');
    return { success: false, error: 'WhatsApp configuration missing' };
  }

  let saved: { relativePath: string; mimeType: string; kind: string } | null = null;
  try {
    saved = await saveOutgoingAgentMedia({
      buffer,
      kind,
      fileName,
      mimeType,
      phoneNumber,
    });

    const mediaId = await uploadWhatsAppMedia(buffer, fileName, mimeType);
    const payload =
      kind === 'image'
        ? { type: 'image', image: { id: mediaId, ...(caption ? { caption } : {}) } }
        : kind === 'video'
          ? { type: 'video', video: { id: mediaId, ...(caption ? { caption } : {}) } }
          : kind === 'audio'
            ? { type: 'audio', audio: { id: mediaId } }
            : {
                type: 'document',
                document: {
                  id: mediaId,
                  filename: fileName,
                  ...(caption ? { caption } : {}),
                },
              };

    const response = await axios.post(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientNumber,
        ...payload,
      },
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const messageId = response.data.messages?.[0]?.id;
    await logOutgoingMessage(recipientNumber, logBody, 'sent', messageId, {
      mediaType: saved.kind,
      mediaPath: saved.relativePath,
      mediaMime: saved.mimeType,
    });
    return { success: true, data: response.data };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Failed to send WhatsApp media:', err.response?.data || err.message);
    await logOutgoingMessage(
      recipientNumber,
      logBody,
      'failed',
      undefined,
      saved
        ? {
            mediaType: saved.kind,
            mediaPath: saved.relativePath,
            mediaMime: saved.mimeType,
          }
        : undefined
    );
    return {
      success: false,
      error: formatWhatsAppError(err.response?.data || err.message || error),
    };
  }
}

/** WhatsApp Cloud API accepted audio MIME types for type=audio. */
function isWhatsAppNativeAudio(mimeType: string): boolean {
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  return [
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/amr',
    'audio/ogg',
    'audio/opus',
  ].includes(mime);
}
