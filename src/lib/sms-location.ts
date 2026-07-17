import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma/client';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { toSmsE164 } from '@/lib/utils';

const LOCATION_REQUEST_TTL_MS = 15 * 60 * 1000;

type PendingSmsLocationRequest = {
  id: string;
  phoneNumber: string;
  deviceId: number;
  deviceName: string;
};

export function extractSmsLocationUrl(message: string): string | null {
  const normalized = message.replace(/&amp;/gi, '&');
  const urlMatch = normalized.match(/https?:\/\/[^\s<>"']+/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[),.;]+$/, '');
  }

  const coordinateMatches = normalized.matchAll(
    /(?:lat(?:itude)?\s*[:=]?\s*)?([+-]?\d{1,2}\.\d+)\s*[,;\s]\s*(?:lon(?:gitude)?\s*[:=]?\s*)?([+-]?\d{1,3}\.\d+)/gi
  );
  for (const match of coordinateMatches) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      return `https://www.google.com/maps?q=${latitude},${longitude}`;
    }
  }

  return null;
}

export async function createSmsLocationRequest(input: {
  phoneNumber: string;
  deviceId: number;
  deviceName: string;
  simNumber: string;
}) {
  const simNumber = toSmsE164(input.simNumber);
  if (!simNumber) {
    throw new Error('Invalid tracker SIM number for location request');
  }

  const now = new Date();
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + LOCATION_REQUEST_TTL_MS);
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE sms_location_requests
      SET status = 'replaced'
      WHERE "phoneNumber" = ${input.phoneNumber}
        AND "deviceId" = ${input.deviceId}
        AND status = 'pending'
    `,
    prisma.$executeRaw`
      INSERT INTO sms_location_requests
        (id, "phoneNumber", "deviceId", "deviceName", "simNumber", status, "requestedAt", "expiresAt")
      VALUES
        (${id}, ${input.phoneNumber}, ${input.deviceId}, ${input.deviceName}, ${simNumber}, 'pending', ${now}, ${expiresAt})
    `,
  ]);
  return { id, expiresAt };
}

export async function deliverSmsLocationResponse(input: {
  smsResponseId: string;
  normalizedFrom: string;
  message: string;
  receivedAt: Date;
}) {
  const locationUrl = extractSmsLocationUrl(input.message);
  if (!locationUrl) return false;

  const simNumber = toSmsE164(input.normalizedFrom);
  if (!simNumber) return false;

  const requests = await prisma.$queryRaw<PendingSmsLocationRequest[]>`
    SELECT id, "phoneNumber", "deviceId", "deviceName"
    FROM sms_location_requests
    WHERE "simNumber" = ${simNumber}
      AND status = 'pending'
      AND "requestedAt" <= ${input.receivedAt}
      AND "expiresAt" >= ${input.receivedAt}
    ORDER BY "requestedAt" DESC
    LIMIT 1
  `;
  const request = requests[0];
  if (!request) return false;

  await sendWhatsAppMessage(
    request.phoneNumber,
    `📍 Fresh SMS location of ${request.deviceName}:\n\n${locationUrl}\n\nLocation tracker se SMS ke zariye receive hui hai.\n\n↩️ Type *M* for main menu.`
  );

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE sms_location_requests
      SET status = 'completed',
          "completedAt" = ${new Date()},
          "smsResponseId" = ${input.smsResponseId},
          "locationUrl" = ${locationUrl}
      WHERE id = ${request.id}
    `,
    prisma.userSession.updateMany({
      where: {
        phoneNumber: request.phoneNumber,
        lastAction: 'WAIT_SMS_LOCATION',
        selectedDeviceId: request.deviceId,
      },
      data: {
        lastAction: null,
        lastCommand: null,
        selectedDeviceId: null,
      },
    }),
  ]);

  return true;
}
