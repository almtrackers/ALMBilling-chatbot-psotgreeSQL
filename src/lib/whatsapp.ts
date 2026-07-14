import axios from 'axios';
import prisma from './prisma/client';
import { getPhoneLookupVariants, normalizePhoneNumber } from './utils';

type SendWhatsAppOptions = {
  ignoreOptOut?: boolean;
};

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

async function logOutgoingMessage(to: string, body: string, status: string, messageId?: string) {
  try {
    await prisma.webhookLog.create({
      data: {
        type: 'outgoing',
        from: 'Agent',
        to: to,
        body: body,
        status: status,
        messageId: messageId,
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
