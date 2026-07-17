import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { traccarClient as apiClient } from '@/lib/traccar-client';
import { Device } from '@/lib/types';
import { parseISO, format as formatDate, startOfDay, endOfDay, subDays, startOfMonth } from 'date-fns';
import fs from 'fs';
import path from 'path';
import { sendWhatsAppMessage, sendWhatsAppDocument } from '@/lib/whatsapp';
import { getPhoneLookupVariants, normalizePhoneNumber } from '@/lib/utils';
import { generateTripReportPdf, type TripReportRow } from '@/lib/chatbot/trip-report-pdf';
import { generateStopsReportPdf, type StopReportRow } from '@/lib/chatbot/stops-report-pdf';
import { generateSummaryReportPdf, type SummaryReportRow } from '@/lib/chatbot/summary-report-pdf';
import { generateEventsReportPdf, type EventsReportRow } from '@/lib/chatbot/events-report-pdf';
import { generateWalletStatementPdf } from '@/lib/chatbot/wallet-statement-pdf';
import { reverseGeocode } from '@/lib/geocoding';
import { sendDeviceCommand } from '@/lib/traccar-commands';
import { createSmsLocationRequest } from '@/lib/sms-location';

async function sendChatbotMessage(to: string, message: string, options?: { ignoreOptOut?: boolean }) {
  await sendWhatsAppMessage(to, message, options);
}

const CHOKAS_NAME = process.env.WHATSAPP_CHATBOT_NAME || 'AlmChokas';
const CHOKAS_EMOJI = '🤖';
const FOLLOW_UP_DELAY_MS = 2 * 60 * 1000;
const FOLLOW_UP_TEXT =
  "Achha! Jab gari start hogi, main foran WhatsApp kar dunga.\nItni chokasi ke baad bas ek shart hai: alert aane par 'Shukriya Chokas' kehna zaroori hai.\nDone?";
const followUpTimers = new Map<string, NodeJS.Timeout>();

function getChokasIntro() {
  return `Muj say milen, main Al-Muhafiz Trackers ka '${CHOKAS_NAME}' ${CHOKAS_EMOJI} hoon aur main ek bot hoon. Bataein aapki kia madad kar sakta hoon?`;
}

const SERVICE_COMMANDS = [
  { command: 'location', label: 'Location', hint: 'Gari kahan hai', icon: '📍' },
  { command: 'status', label: 'Status', hint: 'Online / Offline / Ignition', icon: '📊' },
  { command: 'speed', label: 'Speed', hint: 'Current speed (km/h)', icon: '🚀' },
  { command: 'ajj ka safar', label: 'Ajj ka Safar', hint: 'Aaj ki total distance', icon: '🛣️' },
  { command: 'pdf report', label: 'PDF Reports', hint: 'Trip / Stop / Summary / Events', icon: '📄' },
  { command: 'stop engine', label: 'Stop Engine', hint: 'Engine lock (password)', icon: '🛑' },
  { command: 'resume engine', label: 'Resume Engine', hint: 'Engine unlock (password)', icon: '🟢' },
  { command: 'due date', label: 'Due Date', hint: 'Expiry / renewal date', icon: '📅' },
  { command: 'invoice', label: 'Invoice', hint: 'Last bill details', icon: '🧾' },
  { command: 'wallet statement', label: 'Wallet Statement', hint: 'Complete PDF statement', icon: '💳' },
  { command: 'live chat', label: 'Live Chat', hint: 'Human agent se baat', icon: '💬' },
] as const;

const PDF_RANGE_OPTIONS = [
  { id: 'today', label: 'Today', hint: 'Aaj ka report', icon: '☀️' },
  { id: 'yesterday', label: 'Yesterday', hint: 'Kal ka report', icon: '🌙' },
  { id: 'last7', label: 'Last 7 days', hint: 'Pichlay 7 din', icon: '📆' },
  { id: 'last15', label: 'Last 15 days', hint: 'Pichlay 15 din', icon: '📅' },
  { id: 'month', label: 'This month', hint: 'Is mahine ka report', icon: '🗓️' },
] as const;

const PDF_REPORT_TYPE_OPTIONS = [
  { id: 'trips', label: 'Trip Report', hint: 'Safar / start-end addresses', icon: '🛣️' },
  { id: 'stops', label: 'Stop Report', hint: 'Rukawat / parking', icon: '🅿️' },
  { id: 'summary', label: 'Summary Report', hint: 'Total distance & time', icon: '📈' },
  { id: 'events', label: 'Events Report', hint: 'Alerts / alarms', icon: '🔔' },
] as const;

type PdfReportTypeId = (typeof PDF_REPORT_TYPE_OPTIONS)[number]['id'];

function formatMenuOption(index: number, icon: string, label: string, hint?: string) {
  const base = `${index}. ${icon} ${label}`;
  return hint ? `${base}\n    └ ${hint}` : base;
}

function getPdfReportTypeMenuText() {
  return PDF_REPORT_TYPE_OPTIONS.map((item, index) =>
    formatMenuOption(index + 1, item.icon, item.label, item.hint)
  ).join('\n');
}

function resolvePdfReportType(selection: string): { id: PdfReportTypeId; label: string; icon: string } | null {
  const index = Number(selection) - 1;
  if (Number.isNaN(index) || index < 0 || index >= PDF_REPORT_TYPE_OPTIONS.length) {
    return null;
  }
  return PDF_REPORT_TYPE_OPTIONS[index];
}

function getPdfRangeMenuText() {
  return PDF_RANGE_OPTIONS.map((item, index) =>
    formatMenuOption(index + 1, item.icon, item.label, item.hint)
  ).join('\n');
}

function resolvePdfDateRange(selection: string): { from: Date; to: Date; label: string; icon: string } | null {
  const index = Number(selection) - 1;
  if (Number.isNaN(index) || index < 0 || index >= PDF_RANGE_OPTIONS.length) {
    return null;
  }
  const option = PDF_RANGE_OPTIONS[index];
  const now = new Date();
  switch (option.id) {
    case 'today':
      return { from: startOfDay(now), to: now, label: option.label, icon: option.icon };
    case 'yesterday': {
      const day = subDays(now, 1);
      return { from: startOfDay(day), to: endOfDay(day), label: option.label, icon: option.icon };
    }
    case 'last7':
      return { from: startOfDay(subDays(now, 6)), to: now, label: option.label, icon: option.icon };
    case 'last15':
      return { from: startOfDay(subDays(now, 14)), to: now, label: option.label, icon: option.icon };
    case 'month':
      return { from: startOfMonth(now), to: now, label: option.label, icon: option.icon };
    default:
      return null;
  }
}

function resolvePdfRangeReportType(lastAction: string | null | undefined): PdfReportTypeId {
  if (!lastAction) return 'trips';
  if (lastAction === 'SELECT_PDF_RANGE') return 'trips';
  if (!lastAction.startsWith('SELECT_PDF_RANGE_')) return 'trips';
  const suffix = lastAction.replace('SELECT_PDF_RANGE_', '').toLowerCase();
  const option = PDF_REPORT_TYPE_OPTIONS.find((t) => t.id === suffix);
  return option?.id ?? 'trips';
}

function getServiceMenuText() {
  return SERVICE_COMMANDS.map((item, index) =>
    formatMenuOption(index + 1, item.icon, item.label, item.hint)
  ).join('\n');
}

function formatDeviceMenu(devices: { name: string }[]) {
  return devices.map((d, i) => `${i + 1}. 🚗 ${d.name}`).join('\n');
}

function getCommandFromNumberSelection(selection: string) {
  const index = Number(selection) - 1;
  if (Number.isNaN(index) || index < 0 || index >= SERVICE_COMMANDS.length) {
    return null;
  }
  return SERVICE_COMMANDS[index].command;
}

function getMainMenuPrompt(userName?: string) {
  const heading = userName
    ? `Hi ${userName}! Welcome back.\n👇 Number reply karein:`
    : `👇 Number reply karein:`;
  return `${getChokasIntro()}\n\n${heading}\n\n${getServiceMenuText()}\n\n↩️ Type *M* for main menu anytime.`;
}

function getPostActionPrompt(allowDeviceSelection: boolean) {
  if (allowDeviceSelection) {
    return '↩️ Type *M* for main menu, ya dusri vehicle number enter karein.';
  }
  return '↩️ Type *M* for main menu.';
}

async function scheduleFollowUpMessage(phoneNumber: string) {
  const existing = followUpTimers.get(phoneNumber);
  if (existing) {
    clearTimeout(existing);
  }
  const timeout = setTimeout(async () => {
    followUpTimers.delete(phoneNumber);
    const session = await prisma.userSession.findFirst({
      where: { phoneNumber },
      select: { lastAction: true, sessionStatus: true, isAssigned: true },
    });
    if (!session || session.sessionStatus === 'agent' || session.isAssigned) return;
    if (session.lastAction && session.lastAction !== 'SERVICE_MENU') return;
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: 'AWAIT_IGNITION_CONFIRM' },
    });
    await sendChatbotMessage(phoneNumber, FOLLOW_UP_TEXT);
  }, FOLLOW_UP_DELAY_MS);
  followUpTimers.set(phoneNumber, timeout);
}

const ADVISORY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADVISORY_DELAY_MS = 8000;

/**
 * Once per 24h WhatsApp session: share current balance, upcoming charges,
 * a low-balance warning when needed, and a cybersecurity tip.
 * Sent with a small delay so the user's actual reply arrives first.
 */
async function maybeSendWalletAdvisory(
  phoneNumber: string,
  localUserId: number,
  advisorySentAt: Date | null | undefined
) {
  try {
    if (advisorySentAt && Date.now() - new Date(advisorySentAt).getTime() < ADVISORY_INTERVAL_MS) {
      return;
    }

    // Mark as sent immediately so parallel messages don't duplicate it.
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { advisorySentAt: new Date() },
    });

    setTimeout(async () => {
      try {
        const { buildWalletAdvisory } = await import('@/lib/chatbot/wallet-advisory');
        const advisory = await buildWalletAdvisory(localUserId);
        if (!advisory) return;
        await sendChatbotMessage(phoneNumber, advisory.message);
      } catch (error) {
        console.error('Failed to send wallet advisory:', error);
      }
    }, ADVISORY_DELAY_MS);
  } catch (error) {
    console.error('Wallet advisory scheduling failed:', error);
  }
}

function normalizeConfirmation(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIgnitionConfirmation(input: string) {
  const normalized = normalizeConfirmation(input);
  const confirmations = new Set([
    'ok', 'okay', 'oky', 'ok ok', 'k', 'done',
    'theek', 'theek hai', 'theek hay', 'thek', 'thek hai', 'thek hay',
    'thik', 'thik hai', 'thik hay', 'theq', 'theq hai', 'theq hay',
    'haan', 'han', 'ha', 'yes',
  ]);
  if (confirmations.has(normalized)) return true;
  return Array.from(confirmations).some((entry) => normalized === entry);
}

async function fetchNotificatorType() {
  try {
    const response = await apiClient.get<string[]>('/notifications/notificators');
    const list = Array.isArray(response.data) ? response.data : [];
    const preferred = ['webhook', 'web', 'mail', 'sms'];
    return preferred.find((item) => list.includes(item)) || list[0] || 'web';
  } catch {
    return 'web';
  }
}

async function activateIgnitionAlertsForDevice(phoneNumber: string, device: Device) {
  const notificator = await fetchNotificatorType();
  const payload = {
    type: 'alarm',
    notificators: notificator,
    attributes: { alarms: 'powerOn' },
    always: false,
    calendarId: 0,
  };

  const notificationResponse = await apiClient.post('/notifications', payload);
  const notificationId = notificationResponse.data?.id;

  if (!notificationId) {
    await sendChatbotMessage(phoneNumber, 'Ignition alert activate nahi ho saka. Please dobara try karein.');
    return;
  }

  await apiClient.post('/permissions', { deviceId: device.id, notificationId });
  await sendChatbotMessage(phoneNumber, `Ignition alerts 20 ghantay ke liye activate ho gaye hain for ${device.name}.`);

  setTimeout(async () => {
    try {
      await apiClient.delete(`/notifications/${notificationId}`);
    } catch {
      // ignore cleanup errors
    }
  }, 20 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'almtrace-chatbot-verify';

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new Response('Verification failed', { status: 403 });
  } catch (error) {
    console.error('Webhook verification error:', error);
    return new Response('Internal error', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch (error) {
    console.error('Failed to parse webhook JSON payload:', error);
  }

  if (payload) {
    setTimeout(() => {
      void processWebhookPayload(payload);
    }, 0);
  }

  return new Response('200 OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

async function processWebhookPayload(payload: any) {
  try {
    try {
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
      }
      const logFilePath = path.join(logDir, 'webhook_payloads.txt');
      const logEntry = `[${new Date().toISOString()}] PAYLOAD: ${JSON.stringify(payload)}\n---\n`;
      fs.appendFileSync(logFilePath, logEntry);
    } catch (fsError) {
      console.error('Failed to write to payload log file:', fsError);
    }

    let dbLogId: number | null = null;
    try {
      const dbLog = await prisma.webhookLog.create({
        data: {
          type: 'incoming',
          from: 'Webhook',
          body: payload.object || (payload.field === 'messages' ? 'Direct Messages' : 'unknown'),
          payload: JSON.stringify(payload),
        },
      });
      dbLogId = dbLog.id;
    } catch (logError) {
      console.error('DATABASE LOGGING FAILED:', logError);
    }

    let from = '';
    let body = '';
    let isVoiceMessage = false;
    let messageId: string | null = null;

    if (payload.object === 'whatsapp_business_account' || payload.field === 'messages' || payload.entry) {
      let values: any[] = [];

      if (payload.entry && payload.entry.length > 0) {
        const entry = payload.entry[0];
        if (Array.isArray(entry.changes)) {
          values = entry.changes.map((change: any) => change?.value).filter(Boolean);
        }
      } else if (payload.object === 'whatsapp_business_account') {
        const entry = payload.entry?.[0];
        const change = entry?.changes?.[0];
        if (change?.value) values = [change.value];
      } else if (payload.field === 'messages') {
        if (payload.value) values = [payload.value];
      }

      let statusUpdated = false;
      for (const value of values) {
        if (value?.statuses && Array.isArray(value.statuses) && value.statuses.length > 0) {
          const statusUpdate = value.statuses[0];
          if (statusUpdate?.id && statusUpdate?.status) {
            try {
              await prisma.webhookLog.update({
                where: { messageId: statusUpdate.id },
                data: { status: statusUpdate.status },
              });
            } catch (err) {
              console.error('Failed to update message status:', err);
            }
          }
          statusUpdated = true;
        }
      }

      for (const value of values) {
        const messages = value?.messages;
        if (Array.isArray(messages) && messages.length > 0) {
          const message = messages[0];
          from = message.from || value?.contacts?.[0]?.wa_id || '';
          messageId = message.id || null;

          if (message.type === 'text') {
            body = message.text?.body || '';
          } else if (message.type === 'button') {
            body = message.button?.text || '';
          } else if (message.type === 'interactive') {
            const interactive = message.interactive;
            if (interactive.type === 'button_reply') {
              body = interactive.button_reply?.title || '';
            } else if (interactive.type === 'list_reply') {
              body = interactive.list_reply?.title || '';
            }
          } else if (!message.type && message.text) {
            body = message.text.body || '';
          } else if (message.type === 'audio' || message.type === 'voice') {
            isVoiceMessage = true;
            body = '[voice]';
          } else if (message.type === 'image') {
            body = message.image?.caption || '[image]';
          } else if (message.type === 'video') {
            body = message.video?.caption || '[video]';
          } else if (message.type === 'document') {
            body = message.document?.caption || '[document]';
          } else if (message.type === 'sticker') {
            body = '[sticker]';
          } else if (message.type === 'location') {
            body = '[location]';
          } else if (message.type === 'contacts') {
            body = '[contact]';
          }
          break;
        }
      }

      if (!from && statusUpdated) {
        return;
      }
    } else {
      from = payload.from || '';
      body = payload.body || '';
    }

    if (!from || (!body && !isVoiceMessage)) {
      return;
    }

    const normalizedPhone = normalizePhoneNumber(from);
    const phoneNumber = normalizedPhone.local || normalizedPhone.digits || normalizedPhone.raw;
    const phoneLookupVariants = getPhoneLookupVariants(from);
    const messageBody = body.trim().toLowerCase();
    const stopCommands = ['stop', 'unsubscribe'];
    const subscribeCommands = ['subscribe'];

    const existingSession = await prisma.userSession.findFirst({
      where: { phoneNumber: { in: phoneLookupVariants } },
    });

    let session;
    try {
      session = existingSession
        ? await prisma.userSession.update({
            where: { phoneNumber: existingSession.phoneNumber },
            data: {
              updatedAt: new Date(),
              phoneNumber,
            },
          })
        : await prisma.userSession.create({
            data: { phoneNumber, sessionStatus: 'bot' },
          });
    } catch (sessionError) {
      console.error('Failed to create/update session:', sessionError);
      return;
    }

    if (messageId && dbLogId) {
      try {
        await prisma.webhookLog.update({
          where: { id: dbLogId },
          data: {
            type: 'incoming',
            from: phoneNumber,
            body: body,
            payload: JSON.stringify(payload),
            messageId,
          },
        });
      } catch {
        try {
          await prisma.webhookLog.upsert({
            where: { messageId },
            update: {
              type: 'incoming',
              from: phoneNumber,
              body: body,
              payload: JSON.stringify(payload),
            },
            create: {
              type: 'incoming',
              from: phoneNumber,
              body: body,
              payload: JSON.stringify(payload),
              messageId,
            },
          });
          await prisma.webhookLog.delete({ where: { id: dbLogId } });
        } catch (fallbackErr) {
          console.error('Failed to upsert webhook log:', fallbackErr);
        }
      }
    } else if (messageId) {
      try {
        await prisma.webhookLog.upsert({
          where: { messageId },
          update: {
            type: 'incoming',
            from: phoneNumber,
            body: body,
            payload: JSON.stringify(payload),
          },
          create: {
            type: 'incoming',
            from: phoneNumber,
            body: body,
            payload: JSON.stringify(payload),
            messageId,
          },
        });
      } catch (updateErr) {
        console.error('Failed to upsert webhook log:', updateErr);
      }
    } else if (dbLogId) {
      try {
        await prisma.webhookLog.update({
          where: { id: dbLogId },
          data: {
            from: phoneNumber,
            body: body,
            payload: JSON.stringify(payload),
          },
        });
      } catch (updateErr) {
        console.error('Failed to update webhook log:', updateErr);
      }
    } else {
      await prisma.webhookLog.create({
        data: {
          type: 'incoming',
          from: phoneNumber,
          body: body,
          payload: JSON.stringify(payload),
        },
      });
    }

    if (session.sessionStatus === 'agent') {
      return;
    }

    if (isVoiceMessage) {
      await sendChatbotMessage(phoneNumber, 'Voice messages supported nahi hain. Please text me message bhejein.');
      return;
    }

    if (stopCommands.includes(messageBody)) {
      await prisma.userSession.update({
        where: { phoneNumber },
        data: {
          lastAction: 'OPTED_OUT',
          lastCommand: null,
          selectedDeviceId: null,
          sessionStatus: 'bot',
          isAssigned: false,
          assignedTo: null,
        },
      });
      await sendChatbotMessage(
        phoneNumber,
        'We noted your request. You are now unsubscribed from alerts. Reply SUBSCRIBE anytime to resume messages.',
        { ignoreOptOut: true }
      );
      return;
    }

    if (subscribeCommands.includes(messageBody)) {
      await prisma.userSession.update({
        where: { phoneNumber },
        data: {
          lastAction: null,
          lastCommand: null,
          selectedDeviceId: null,
          sessionStatus: 'bot',
        },
      });
      await sendChatbotMessage(phoneNumber, 'You are subscribed again. Alerts and chatbot messages are now active.');
      return;
    }

    if (session.lastAction === 'OPTED_OUT') {
      return;
    }

    let registration = await prisma.registrationNumber.findFirst({
      where: { number: { in: phoneLookupVariants } },
      include: { user: true },
    });

    if (!registration) {
      registration = await findRegistrationFromTraccarUsername(phoneLookupVariants, phoneNumber);
      if (!registration) {
        if (session.lastAction === 'UNREGISTERED_LIVE_CHAT_OFFER' && messageBody === '1') {
          await requestLiveAgent(phoneNumber);
          return;
        }

        await prisma.userSession.update({
          where: { phoneNumber },
          data: {
            lastAction: 'UNREGISTERED_LIVE_CHAT_OFFER',
            lastCommand: null,
            selectedDeviceId: null,
            sessionStatus: 'bot',
            isAssigned: false,
            assignedTo: null,
          },
        });
        await sendChatbotMessage(
          phoneNumber,
          'This is not a registered number. If you are a registered customer, please use your registered number.\n\nReply 1 for live chat support.'
        );
        return;
      }
    }

    const user = registration.user;

    await scheduleFollowUpMessage(phoneNumber);
    await maybeSendWalletAdvisory(phoneNumber, user.id, session.advisorySentAt);

    if (session.lastAction === 'AWAIT_IGNITION_CONFIRM' && isIgnitionConfirmation(messageBody)) {
      const devices = await fetchUserDevices(user.traccarId!);
      if (devices.length === 0) {
        await sendChatbotMessage(phoneNumber, 'No devices found for your account.');
        await prisma.userSession.update({
          where: { phoneNumber },
          data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
        });
        return;
      }

      if (devices.length === 1) {
        await activateIgnitionAlertsForDevice(phoneNumber, devices[0]);
        await prisma.userSession.update({
          where: { phoneNumber },
          data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
        });
        return;
      }

      const deviceList = formatDeviceMenu(devices);
      await prisma.userSession.update({
        where: { phoneNumber },
        data: { lastAction: 'SELECT_IGNITION_DEVICE', lastCommand: null, selectedDeviceId: null },
      });
      await sendChatbotMessage(
        phoneNumber,
        `🔔 Ignition alert ke liye vehicle select karein:\n\n${deviceList}\n\n${getPostActionPrompt(true)}`
      );
      return;
    }

    if (messageBody === 'hi') {
      await prisma.userSession.update({
        where: { phoneNumber },
        data: { lastAction: 'SERVICE_MENU', lastCommand: null },
      });
      await sendChatbotMessage(phoneNumber, getMainMenuPrompt(user.name));
      return;
    }

    if (messageBody === 'm') {
      await prisma.$executeRaw`
        UPDATE sms_location_requests
        SET status = 'cancelled'
        WHERE "phoneNumber" = ${phoneNumber} AND status = 'pending'
      `;
      await prisma.userSession.update({
        where: { phoneNumber },
        data: { lastAction: 'SERVICE_MENU', lastCommand: null, selectedDeviceId: null },
      });
      await sendChatbotMessage(phoneNumber, getMainMenuPrompt());
      return;
    }

    if (session.lastAction === 'SELECT_IGNITION_DEVICE' && /^\d+$/.test(messageBody)) {
      const selection = parseInt(messageBody);
      const devices = await fetchUserDevices(user.traccarId!);
      if (selection > 0 && selection <= devices.length) {
        const device = devices[selection - 1];
        await activateIgnitionAlertsForDevice(phoneNumber, device);
        await prisma.userSession.update({
          where: { phoneNumber },
          data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
        });
        return;
      }
      await sendChatbotMessage(
        phoneNumber,
        'Invalid selection. Dobara number try karein.\n↩️ Type *M* for main menu ya vehicle number enter karein.'
      );
      return;
    }

    if (session.lastAction === 'SELECT_DEVICE' && /^\d+$/.test(messageBody)) {
      const selection = parseInt(messageBody);
      const devices = await fetchUserDevices(user.traccarId!);
      if (selection > 0 && selection <= devices.length) {
        const device = devices[selection - 1];
        await executeCommand(phoneNumber, session.lastCommand!, device, user.traccarId!, true);
        return;
      }
      await sendChatbotMessage(
        phoneNumber,
        'Invalid selection. Dobara number try karein.\n↩️ Type *M* for main menu ya vehicle number enter karein.'
      );
      return;
    }

    if (session.lastAction === 'SELECT_PDF_REPORT_TYPE' && /^\d+$/.test(messageBody)) {
      const deviceId = session.selectedDeviceId;
      if (!deviceId) {
        await sendChatbotMessage(phoneNumber, `Session expired.\n${getMainMenuPrompt()}`);
        return;
      }
      const reportType = resolvePdfReportType(messageBody);
      if (!reportType) {
        await sendChatbotMessage(
          phoneNumber,
          `Invalid selection. Report type choose karein:\n\n${getPdfReportTypeMenuText()}\n\n↩️ Type *M* for main menu.`
        );
        return;
      }
      const device = await fetchDevice(deviceId);
      await prisma.userSession.update({
        where: { phoneNumber },
        data: {
          lastAction: `SELECT_PDF_RANGE_${reportType.id.toUpperCase()}`,
          lastCommand: 'pdf report',
          selectedDeviceId: deviceId,
        },
      });
      await sendChatbotMessage(
        phoneNumber,
        `📄 ${reportType.icon} ${reportType.label} for ${device.name}\n\n📅 Date range select karein:\n\n${getPdfRangeMenuText()}\n\n↩️ Type *M* for main menu.`
      );
      return;
    }

    if (session.lastAction?.startsWith('SELECT_PDF_RANGE') && /^\d+$/.test(messageBody)) {
      const deviceId = session.selectedDeviceId;
      if (!deviceId) {
        await sendChatbotMessage(phoneNumber, `Session expired.\n${getMainMenuPrompt()}`);
        return;
      }
      const reportTypeId = resolvePdfRangeReportType(session.lastAction);
      const range = resolvePdfDateRange(messageBody);
      if (!range) {
        await sendChatbotMessage(
          phoneNumber,
          `Invalid selection. Date range choose karein:\n\n${getPdfRangeMenuText()}\n\n↩️ Type *M* for main menu.`
        );
        return;
      }
      const device = await fetchDevice(deviceId);
      const devices = await fetchUserDevices(user.traccarId!);
      switch (reportTypeId) {
        case 'stops':
          await sendStopsReportPdf(phoneNumber, device, range.from, range.to, devices.length > 1);
          break;
        case 'summary':
          await sendSummaryReportPdf(phoneNumber, device, range.from, range.to, devices.length > 1);
          break;
        case 'events':
          await sendEventsReportPdf(phoneNumber, device, range.from, range.to, devices.length > 1);
          break;
        case 'trips':
        default:
          await sendTripReportPdf(phoneNumber, device, range.from, range.to, devices.length > 1);
          break;
      }
      return;
    }

    if (session.lastAction?.startsWith('WAIT_PASSWORD')) {
      const deviceId = session.selectedDeviceId;
      if (!deviceId) return;
      const device = await fetchDevice(deviceId);
      if (device.attributes.devicePassword === body) {
        await executeEngineCommand(phoneNumber, session.lastCommand!, device);
      } else {
        const currentAttempts = getPasswordRetryCount(session.lastAction);
        const nextAttempts = currentAttempts + 1;
        const maxRetries = 3;
        if (nextAttempts >= maxRetries) {
          await sendChatbotMessage(
            phoneNumber,
            '❌ Incorrect password 3 times. Command cancelled for safety.\nType M to return to main menu.'
          );
          await prisma.userSession.update({
            where: { phoneNumber },
            data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
          });
        } else {
          const retriesLeft = maxRetries - nextAttempts;
          await prisma.userSession.update({
            where: { phoneNumber },
            data: { lastAction: `WAIT_PASSWORD_${nextAttempts}` },
          });
          await sendChatbotMessage(
            phoneNumber,
            `❌ Incorrect password. ${retriesLeft} attempt(s) left.\nPlease enter password again or type M to return to main menu.`
          );
        }
      }
      return;
    }

    if (session.lastAction === 'SERVICE_MENU' && /^\d+$/.test(messageBody)) {
      const mappedCommand = getCommandFromNumberSelection(messageBody);
      if (!mappedCommand) {
        await sendChatbotMessage(phoneNumber, `Invalid selection.\n${getMainMenuPrompt()}`);
        return;
      }

      if (mappedCommand === 'live chat') {
        await requestLiveAgent(phoneNumber);
        return;
      }
      if (mappedCommand === 'wallet statement') {
        await sendWalletStatementPdf(phoneNumber, user.id);
        return;
      }

      const devices = await fetchUserDevices(user.traccarId!);

      if (devices.length === 0) {
        await sendChatbotMessage(phoneNumber, 'No devices found for your account.');
        return;
      }

      if (devices.length === 1) {
        await executeCommand(phoneNumber, mappedCommand, devices[0], user.traccarId!);
      } else {
        const deviceList = formatDeviceMenu(devices);
        await prisma.userSession.update({
          where: { phoneNumber },
          data: { lastAction: 'SELECT_DEVICE', lastCommand: mappedCommand },
        });
        await sendChatbotMessage(
          phoneNumber,
          `🚗 Multiple vehicles hain. Number select karein:\n\n${deviceList}\n\n${getPostActionPrompt(true)}`
        );
      }
      return;
    }

    const commands = [
      'location',
      'status',
      'speed',
      'ajj ka safar',
      'pdf report',
      'stop engine',
      'resume engine',
      'due date',
      'invoice',
      'wallet statement',
      'live chat',
    ];
    if (commands.includes(messageBody)) {
      if (messageBody === 'live chat') {
        await requestLiveAgent(phoneNumber);
        return;
      }
      if (messageBody === 'wallet statement') {
        await sendWalletStatementPdf(phoneNumber, user.id);
        return;
      }

      const devices = await fetchUserDevices(user.traccarId!);

      if (devices.length === 0) {
        await sendChatbotMessage(phoneNumber, 'No devices found for your account.');
        return;
      }

      if (devices.length === 1) {
        await executeCommand(phoneNumber, messageBody, devices[0], user.traccarId!);
      } else {
        const deviceList = formatDeviceMenu(devices);
        await prisma.userSession.update({
          where: { phoneNumber },
          data: { lastAction: 'SELECT_DEVICE', lastCommand: messageBody },
        });
        await sendChatbotMessage(
          phoneNumber,
          `🚗 Multiple vehicles hain. Number select karein:\n\n${deviceList}\n\n${getPostActionPrompt(true)}`
        );
      }
      return;
    }

    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: 'SERVICE_MENU', lastCommand: null },
    });
    await sendChatbotMessage(phoneNumber, `I didn't understand that.\n${getMainMenuPrompt()}`);
  } catch (error) {
    console.error('Chatbot API Error:', error);
  }
}

async function fetchUserDevices(userId: number): Promise<Device[]> {
  const response = await apiClient.get<Device[]>(`/devices?userId=${userId}`);
  return response.data;
}

function getPasswordRetryCount(lastAction: string | null) {
  if (!lastAction) return 0;
  const match = lastAction.match(/^WAIT_PASSWORD(?:_(\d+))?$/);
  if (!match) return 0;
  return Number(match[1] || 0);
}

async function findRegistrationFromTraccarUsername(phoneVariants: string[], normalizedLocalPhone: string) {
  for (const phoneVariant of phoneVariants) {
    try {
      const response = await apiClient.get<any[]>(`/users?username=${encodeURIComponent(phoneVariant)}`);
      const matchedUser = response.data?.find((u: any) => {
        if (u.administrator || u.manager) return false;
        return isExactPhoneUsernameMatch(u?.username, phoneVariant);
      });
      if (!matchedUser) {
        continue;
      }

      let dbUser = await prisma.user.findUnique({
        where: { traccarId: matchedUser.id },
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            traccarId: matchedUser.id,
            name: matchedUser.name || phoneVariant,
          },
        });
      }

      await prisma.registrationNumber.upsert({
        where: { number: normalizedLocalPhone },
        update: { userId: dbUser.id },
        create: {
          number: normalizedLocalPhone,
          userId: dbUser.id,
        },
      });

      const savedRegistration = await prisma.registrationNumber.findUnique({
        where: { number: normalizedLocalPhone },
        include: { user: true },
      });

      if (savedRegistration) {
        return savedRegistration;
      }
    } catch (error) {
      console.error(`Failed to check Traccar username for ${phoneVariant}:`, error);
    }
  }

  return null;
}

function isExactPhoneUsernameMatch(username: string | undefined, candidatePhone: string) {
  if (!username || !candidatePhone) return false;
  const usernameNormalized = normalizePhoneNumber(username);
  const candidateNormalized = normalizePhoneNumber(candidatePhone);

  const usernameVariants = new Set(
    [usernameNormalized.raw, usernameNormalized.digits, usernameNormalized.local, usernameNormalized.international]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  );
  const candidateVariants = [
    candidateNormalized.raw,
    candidateNormalized.digits,
    candidateNormalized.local,
    candidateNormalized.international,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  return candidateVariants.some((variant) => usernameVariants.has(variant));
}

async function fetchDevice(deviceId: number): Promise<Device> {
  const response = await apiClient.get<Device[]>(`/devices?id=${deviceId}`);
  return response.data[0];
}

type PositionSnapshot = {
  id?: number;
  deviceId?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  fixTime?: string;
  deviceTime?: string;
  serverTime?: string;
};

type EventReportRowWithAddress = EventsReportRow & {
  positionId?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
};

type RawTripReport = TripReportRow & {
  startLat?: number;
  startLon?: number;
  endLat?: number;
  endLon?: number;
};

type RawStopReport = StopReportRow & {
  lat?: number;
  lon?: number;
  lng?: number;
};

function asFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function positionTime(position: PositionSnapshot) {
  return position.fixTime || position.deviceTime || position.serverTime || '';
}

function normalizeTripRow(trip: RawTripReport): TripReportRow {
  return {
    ...trip,
    startLatitude: asFiniteNumber(trip.startLatitude) ?? asFiniteNumber(trip.startLat),
    startLongitude: asFiniteNumber(trip.startLongitude) ?? asFiniteNumber(trip.startLon),
    endLatitude: asFiniteNumber(trip.endLatitude) ?? asFiniteNumber(trip.endLat),
    endLongitude: asFiniteNumber(trip.endLongitude) ?? asFiniteNumber(trip.endLon),
    startAddress: trip.startAddress?.trim() || undefined,
    endAddress: trip.endAddress?.trim() || undefined,
  };
}

function normalizeStopRow(stop: RawStopReport): StopReportRow {
  return {
    ...stop,
    latitude: asFiniteNumber(stop.latitude) ?? asFiniteNumber(stop.lat),
    longitude:
      asFiniteNumber(stop.longitude) ?? asFiniteNumber(stop.lon) ?? asFiniteNumber(stop.lng),
    address: stop.address?.trim() || undefined,
  };
}

async function fetchRoutePositions(deviceId: number, from: Date, to: Date): Promise<PositionSnapshot[]> {
  const query = `deviceId=${deviceId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;

  try {
    const routeResponse = await apiClient.get<PositionSnapshot[]>(`/reports/route?${query}`);
    if (Array.isArray(routeResponse.data) && routeResponse.data.length > 0) {
      return routeResponse.data;
    }
  } catch (error) {
    console.warn('Failed to fetch /reports/route for PDF addresses:', error);
  }

  try {
    const positionsResponse = await apiClient.get<PositionSnapshot[]>(`/positions?${query}`);
    if (Array.isArray(positionsResponse.data)) {
      return positionsResponse.data;
    }
  } catch (error) {
    console.warn('Failed to fetch /positions for PDF addresses:', error);
  }

  return [];
}

/** Fill missing trip start/end coordinates from route positions (same approach as Android app). */
async function attachTripCoordinates(
  trips: TripReportRow[],
  deviceId: number,
  from: Date,
  to: Date
): Promise<TripReportRow[]> {
  const normalized = trips.map((trip) => normalizeTripRow(trip as RawTripReport));
  const needsCoords = normalized.some(
    (trip) =>
      trip.startLatitude == null ||
      trip.startLongitude == null ||
      trip.endLatitude == null ||
      trip.endLongitude == null
  );
  if (!needsCoords) return normalized;

  const positions = (await fetchRoutePositions(deviceId, from, to))
    .filter((position) => Number.isFinite(position.latitude) && Number.isFinite(position.longitude))
    .sort((a, b) => new Date(positionTime(a)).getTime() - new Date(positionTime(b)).getTime());

  if (positions.length === 0) return normalized;

  return normalized.map((trip) => {
    const startMs = new Date(trip.startTime).getTime();
    const endMs = new Date(trip.endTime).getTime();

    const startPos =
      positions.find((position) => {
        const t = new Date(positionTime(position)).getTime();
        return Number.isFinite(t) && t >= startMs;
      }) || positions[0];

    const endPos =
      [...positions].reverse().find((position) => {
        const t = new Date(positionTime(position)).getTime();
        return Number.isFinite(t) && t <= endMs;
      }) || positions[positions.length - 1];

    return {
      ...trip,
      startLatitude: trip.startLatitude ?? asFiniteNumber(startPos?.latitude),
      startLongitude: trip.startLongitude ?? asFiniteNumber(startPos?.longitude),
      endLatitude: trip.endLatitude ?? asFiniteNumber(endPos?.latitude),
      endLongitude: trip.endLongitude ?? asFiniteNumber(endPos?.longitude),
      startAddress: trip.startAddress || startPos?.address?.trim() || undefined,
      endAddress: trip.endAddress || endPos?.address?.trim() || undefined,
    };
  });
}

async function resolveAddress(address?: string, latitude?: number, longitude?: number) {
  if (address && address.trim() && address.trim().toLowerCase() !== 'location unavailable') {
    return address.trim();
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  const resolved = await reverseGeocode(Number(latitude), Number(longitude));
  if (!resolved || resolved.toLowerCase() === 'location unavailable') {
    return undefined;
  }
  return resolved;
}

async function enrichTripAddresses(trips: TripReportRow[]) {
  const enriched: TripReportRow[] = [];
  for (const trip of trips) {
    enriched.push({
      ...trip,
      startAddress: await resolveAddress(trip.startAddress, trip.startLatitude, trip.startLongitude),
      endAddress: await resolveAddress(trip.endAddress, trip.endLatitude, trip.endLongitude),
    });
  }
  return enriched;
}

async function enrichStopAddresses(stops: StopReportRow[]) {
  const normalized = stops.map((stop) => normalizeStopRow(stop as RawStopReport));
  const enriched: StopReportRow[] = [];
  for (const stop of normalized) {
    enriched.push({
      ...stop,
      address: await resolveAddress(stop.address, stop.latitude, stop.longitude),
    });
  }
  return enriched;
}

async function fetchPositionsByIds(positionIds: number[]) {
  if (positionIds.length === 0) {
    return new Map<number, PositionSnapshot>();
  }

  const params = new URLSearchParams();
  for (const id of positionIds) {
    params.append('id', String(id));
  }

  const response = await apiClient.get<PositionSnapshot[]>(`/positions?${params.toString()}`);
  const positions = Array.isArray(response.data) ? response.data : [];
  return new Map<number, PositionSnapshot>(
    positions
      .filter((position) => typeof position?.id === 'number')
      .map((position) => [Number(position.id), position])
  );
}

async function enrichEventAddresses(rows: EventsReportRow[]) {
  const typedRows = rows as EventReportRowWithAddress[];
  const uniquePositionIds = Array.from(
    new Set(
      typedRows
        .map((row) => Number(row.positionId))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );

  const positionsById = await fetchPositionsByIds(uniquePositionIds);
  const enriched: EventReportRowWithAddress[] = [];

  for (const row of typedRows) {
    const position = row.positionId ? positionsById.get(Number(row.positionId)) : undefined;
    const latitude = asFiniteNumber(row.latitude) ?? asFiniteNumber(position?.latitude);
    const longitude = asFiniteNumber(row.longitude) ?? asFiniteNumber(position?.longitude);
    const address = await resolveAddress(row.address ?? position?.address, latitude, longitude);

    enriched.push({
      ...row,
      latitude,
      longitude,
      address,
    });
  }

  return enriched;
}

async function sendTripReportPdf(
  phoneNumber: string,
  device: Device,
  from: Date,
  to: Date,
  allowDeviceSelection = false
) {
  await sendChatbotMessage(
    phoneNumber,
    `⏳ Preparing Trip PDF for ${device.name}...\nAddresses resolve ho rahe hain, please wait.`
  );

  try {
    const tripsResponse = await apiClient.get<TripReportRow[]>(
      `/reports/trips?deviceId=${device.id}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
    );
    const withCoords = await attachTripCoordinates(
      Array.isArray(tripsResponse.data) ? tripsResponse.data : [],
      device.id,
      from,
      to
    );
    const trips = await enrichTripAddresses(withCoords);

    if (trips.length === 0) {
      await sendChatbotMessage(
        phoneNumber,
        `📄 No trips found for ${device.name} in the selected range.\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
    } else {
      const pdf = await generateTripReportPdf({
        vehicleName: device.name,
        from,
        to,
        trips,
      });

      const caption = `Trip Report — ${device.name}\nTrips: ${trips.length} | Distance: ${pdf.totalDistanceKm.toFixed(2)} km | Duration: ${pdf.totalDurationLabel}`;
      const sent = await sendWhatsAppDocument(phoneNumber, pdf.buffer, pdf.fileName, { caption });

      if (!sent.success) {
        await sendChatbotMessage(
          phoneNumber,
          `❌ PDF report ban nahi ho saka. Please later try karein.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      } else {
        await sendChatbotMessage(
          phoneNumber,
          `✅ Trip PDF bhej diya gaya hai for ${device.name}.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      }
    }
  } catch (error) {
    console.error('Failed to send trip PDF report:', error);
    await sendChatbotMessage(
      phoneNumber,
      `❌ PDF report banate waqt error aaya. Please later try karein.\n\n${getPostActionPrompt(allowDeviceSelection)}`
    );
  }

  await scheduleFollowUpMessage(phoneNumber);

  if (allowDeviceSelection) {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: 'SELECT_DEVICE', lastCommand: 'pdf report', selectedDeviceId: null },
    });
  } else {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
    });
  }
}

async function sendStopsReportPdf(
  phoneNumber: string,
  device: Device,
  from: Date,
  to: Date,
  allowDeviceSelection = false
) {
  await sendChatbotMessage(
    phoneNumber,
    `⏳ Preparing Stop PDF for ${device.name}...\nAddresses resolve ho rahe hain, please wait.`
  );

  try {
    const response = await apiClient.get<StopReportRow[]>(
      `/reports/stops?deviceId=${device.id}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
    );
    const stops = await enrichStopAddresses(Array.isArray(response.data) ? response.data : []);

    if (stops.length === 0) {
      await sendChatbotMessage(
        phoneNumber,
        `📄 No stops found for ${device.name} in the selected range.\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
    } else {
      const pdf = await generateStopsReportPdf({
        vehicleName: device.name,
        from,
        to,
        stops,
      });
      const caption = `Stop Report — ${device.name}\nStops: ${stops.length} | Duration: ${pdf.totalDurationLabel}`;
      const sent = await sendWhatsAppDocument(phoneNumber, pdf.buffer, pdf.fileName, { caption });

      if (!sent.success) {
        await sendChatbotMessage(
          phoneNumber,
          `❌ PDF report ban nahi ho saka. Please later try karein.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      } else {
        await sendChatbotMessage(
          phoneNumber,
          `✅ Stop PDF bhej diya gaya hai for ${device.name}.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      }
    }
  } catch (error) {
    console.error('Failed to send stop PDF report:', error);
    await sendChatbotMessage(
      phoneNumber,
      `❌ PDF report banate waqt error aaya. Please later try karein.\n\n${getPostActionPrompt(allowDeviceSelection)}`
    );
  }

  await scheduleFollowUpMessage(phoneNumber);

  if (allowDeviceSelection) {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: 'SELECT_DEVICE', lastCommand: 'pdf report', selectedDeviceId: null },
    });
  } else {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
    });
  }
}

async function sendSummaryReportPdf(
  phoneNumber: string,
  device: Device,
  from: Date,
  to: Date,
  allowDeviceSelection = false
) {
  await sendChatbotMessage(phoneNumber, `⏳ Preparing Summary PDF for ${device.name}...\nPlease wait.`);

  try {
    const response = await apiClient.get<SummaryReportRow[]>(
      `/reports/summary?deviceId=${device.id}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
    );
    const rows = Array.isArray(response.data) ? response.data : [];

    if (rows.length === 0) {
      await sendChatbotMessage(
        phoneNumber,
        `📄 No summary found for ${device.name} in the selected range.\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
    } else {
      const pdf = await generateSummaryReportPdf({
        vehicleName: device.name,
        from,
        to,
        rows,
      });
      const caption = `Summary Report — ${device.name}\nEntries: ${rows.length} | Distance: ${pdf.totalDistanceKm.toFixed(2)} km`;
      const sent = await sendWhatsAppDocument(phoneNumber, pdf.buffer, pdf.fileName, { caption });

      if (!sent.success) {
        await sendChatbotMessage(
          phoneNumber,
          `❌ PDF report ban nahi ho saka. Please later try karein.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      } else {
        await sendChatbotMessage(
          phoneNumber,
          `✅ Summary PDF bhej diya gaya hai for ${device.name}.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      }
    }
  } catch (error) {
    console.error('Failed to send summary PDF report:', error);
    await sendChatbotMessage(
      phoneNumber,
      `❌ PDF report banate waqt error aaya. Please later try karein.\n\n${getPostActionPrompt(allowDeviceSelection)}`
    );
  }

  await scheduleFollowUpMessage(phoneNumber);

  if (allowDeviceSelection) {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: 'SELECT_DEVICE', lastCommand: 'pdf report', selectedDeviceId: null },
    });
  } else {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
    });
  }
}

async function sendEventsReportPdf(
  phoneNumber: string,
  device: Device,
  from: Date,
  to: Date,
  allowDeviceSelection = false
) {
  await sendChatbotMessage(
    phoneNumber,
    `⏳ Preparing Events PDF for ${device.name}...\nAddresses resolve ho rahe hain, please wait.`
  );

  try {
    const response = await apiClient.get<EventsReportRow[]>(
      `/reports/events?deviceId=${device.id}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
    );
    const rows = await enrichEventAddresses(Array.isArray(response.data) ? response.data : []);

    if (rows.length === 0) {
      await sendChatbotMessage(
        phoneNumber,
        `📄 No events found for ${device.name} in the selected range.\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
    } else {
      const pdf = await generateEventsReportPdf({
        vehicleName: device.name,
        from,
        to,
        rows,
      });
      const caption = `Events Report — ${device.name}\nEvents: ${rows.length}`;
      const sent = await sendWhatsAppDocument(phoneNumber, pdf.buffer, pdf.fileName, { caption });

      if (!sent.success) {
        await sendChatbotMessage(
          phoneNumber,
          `❌ PDF report ban nahi ho saka. Please later try karein.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      } else {
        await sendChatbotMessage(
          phoneNumber,
          `✅ Events PDF bhej diya gaya hai for ${device.name}.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      }
    }
  } catch (error) {
    console.error('Failed to send events PDF report:', error);
    await sendChatbotMessage(
      phoneNumber,
      `❌ PDF report banate waqt error aaya. Please later try karein.\n\n${getPostActionPrompt(allowDeviceSelection)}`
    );
  }

  await scheduleFollowUpMessage(phoneNumber);

  if (allowDeviceSelection) {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: 'SELECT_DEVICE', lastCommand: 'pdf report', selectedDeviceId: null },
    });
  } else {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
    });
  }
}

async function sendWalletStatementPdf(phoneNumber: string, localUserId: number) {
  await sendChatbotMessage(
    phoneNumber,
    '⏳ Preparing your complete wallet statement PDF...\nPlease wait.'
  );

  try {
    const pdf = await generateWalletStatementPdf(localUserId);
    const sent = await sendWhatsAppDocument(phoneNumber, pdf.buffer, pdf.fileName, {
      caption: `Wallet Statement — ${pdf.walletName}\nCurrent balance: PKR ${pdf.balance.toLocaleString()}`,
    });

    if (!sent.success) {
      throw new Error(sent.error ? String(sent.error) : 'WhatsApp document send failed');
    }

    await sendChatbotMessage(
      phoneNumber,
      `✅ Wallet statement PDF bhej diya gaya hai.\n\nCurrent balance: PKR ${pdf.balance.toLocaleString()}\n\n↩️ Type *M* for main menu.`
    );
  } catch (error) {
    console.error('Failed to send wallet statement PDF:', error);
    await sendChatbotMessage(
      phoneNumber,
      '❌ Wallet statement PDF banate waqt error aaya. Please later try karein.\n\n↩️ Type *M* for main menu.'
    );
  }

  await prisma.userSession.update({
    where: { phoneNumber },
    data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
  });
}

async function requestLiveAgent(phoneNumber: string, customMessage?: string) {
  await prisma.userSession.update({
    where: { phoneNumber },
    data: {
      lastAction: 'REQUEST_LIVE_AGENT',
      lastCommand: null,
      selectedDeviceId: null,
      isAssigned: false,
      sessionStatus: 'bot',
    },
  });

  await sendChatbotMessage(
    phoneNumber,
    customMessage ||
      '💬 Live chat request noted.\nKindly wait while our agents are busy. They will contact you as early as possible.\n\nType M to return to main menu.'
  );
}

async function executeCommand(
  phoneNumber: string,
  command: string,
  device: Device,
  userId: number,
  allowDeviceSelection = false
) {
  const expiryInfo = getDeviceExpiryInfo(device);
  const commandsRequiringActiveSubscription = new Set([
    'location',
    'status',
    'speed',
    'ajj ka safar',
    'pdf report',
    'stop engine',
    'resume engine',
  ]);

  if (commandsRequiringActiveSubscription.has(command) && expiryInfo.isExpired) {
    await sendChatbotMessage(
      phoneNumber,
      `⚠️ ${device.name} service is expired${expiryInfo.formattedExpiry ? ` on ${expiryInfo.formattedExpiry}` : ''}.\nPlease pay renewal first, then retry this service.\n\nYou can check due date or invoice from menu.\n\n${getPostActionPrompt(allowDeviceSelection)}`
    );
    if (allowDeviceSelection) {
      await prisma.userSession.update({
        where: { phoneNumber },
        data: { lastAction: 'SELECT_DEVICE', lastCommand: command, selectedDeviceId: null },
      });
    } else {
      await prisma.userSession.update({
        where: { phoneNumber },
        data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
      });
    }
    return;
  }

  switch (command) {
    case 'location': {
      let smsRequestError: unknown = null;
      if (device.status !== 'online') {
        try {
          const result = await sendDeviceCommand(device.id, 'URL#', { channel: 'sms' });
          if (result.status !== 'sent' || !result.simNumber) {
            throw new Error(result.detail || 'SMS location command was not sent');
          }

          await createSmsLocationRequest({
            phoneNumber,
            deviceId: device.id,
            deviceName: device.name,
            simNumber: result.simNumber,
          });
          await prisma.userSession.update({
            where: { phoneNumber },
            data: {
              lastAction: 'WAIT_SMS_LOCATION',
              lastCommand: 'location',
              selectedDeviceId: device.id,
            },
          });
          await sendChatbotMessage(
            phoneNumber,
            `📡 ${device.name} is offline.\n\nLive location ke liye *URL#* command SMS se tracker ko bhej di gayi hai. Tracker ka reply receive hotay hi fresh location yahan automatically bhej di jayegi (usually 1-3 minutes).\n\n↩️ Type *M* to cancel and return to main menu.`
          );
          return;
        } catch (error) {
          smsRequestError = error;
          console.error(`Offline SMS location request failed for device ${device.id}:`, error);
        }
      }

      const pos = device.positionId
        ? await apiClient.get(`/positions?id=${device.positionId}`)
        : { data: [] };
      const position = pos.data?.[0];
      if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) {
        await sendChatbotMessage(
          phoneNumber,
          `📍 Location unavailable for ${device.name}.${smsRequestError ? '\nSMS location request bhi send nahi ho saki. Please SIM/gateway configuration check karwain.' : ''}\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
        break;
      }
      const mapLink = `https://www.google.com/maps?q=${position.latitude},${position.longitude}`;
      await sendChatbotMessage(
        phoneNumber,
        smsRequestError
          ? `⚠️ ${device.name} is offline and SMS location request failed. Last known location:\n\n${mapLink}\n\n${getPostActionPrompt(allowDeviceSelection)}`
          : `📍 Location of ${device.name}:\n\n${mapLink}\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
      break;
    }

    case 'status': {
      const status = device.status === 'online' ? '🟢 Online' : '🔴 Offline';
      const ignition = device.attributes.ignition ? '🔥 ON' : '❄️ OFF';
      await sendChatbotMessage(
        phoneNumber,
        `📊 Status of ${device.name}:\n\nStatus: ${status}\nIgnition: ${ignition}\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
      break;
    }

    case 'speed': {
      const posSpeed = await apiClient.get(`/positions?id=${device.positionId}`);
      const speed = posSpeed.data[0].speed * 1.852;
      await sendChatbotMessage(
        phoneNumber,
        `🚀 Current speed of ${device.name}: ${speed.toFixed(1)} km/h\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
      break;
    }

    case 'ajj ka safar': {
      const startOfDayLocal = new Date();
      startOfDayLocal.setHours(0, 0, 0, 0);
      const now = new Date();
      const tripsResponse = await apiClient.get<any[]>(
        `/reports/trips?deviceId=${device.id}&from=${encodeURIComponent(startOfDayLocal.toISOString())}&to=${encodeURIComponent(now.toISOString())}`
      );
      const trips = Array.isArray(tripsResponse.data) ? tripsResponse.data : [];
      const totalDistanceMeters = trips.reduce((sum: number, trip: any) => sum + Number(trip?.distance || 0), 0);
      const totalDistanceKm = totalDistanceMeters / 1000;
      await sendChatbotMessage(
        phoneNumber,
        `🛣️ Ajj ka Safar for ${device.name}: ${totalDistanceKm.toFixed(2)} km\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
      break;
    }

    case 'pdf report': {
      await prisma.userSession.update({
        where: { phoneNumber },
        data: {
          lastAction: 'SELECT_PDF_REPORT_TYPE',
          lastCommand: 'pdf report',
          selectedDeviceId: device.id,
        },
      });
      await sendChatbotMessage(
        phoneNumber,
        `📄 PDF Reports for ${device.name}\n\n📋 Report type select karein:\n\n${getPdfReportTypeMenuText()}\n\n↩️ Type *M* for main menu.`
      );
      return;
    }

    case 'stop engine':
    case 'resume engine':
      await prisma.userSession.update({
        where: { phoneNumber },
        data: { lastAction: 'WAIT_PASSWORD_0', lastCommand: command, selectedDeviceId: device.id },
      });
      await sendChatbotMessage(
        phoneNumber,
        `🔐 Please enter the password for ${device.name} to ${command}:\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
      break;

    case 'due date': {
      const billingExpiry = device.attributes?.expiryDate || device.expirationTime;
      const expiry = billingExpiry ? formatDate(parseISO(billingExpiry), 'dd MMM yyyy') : 'No expiry set';
      await sendChatbotMessage(
        phoneNumber,
        `📅 Expiry for ${device.name}: ${expiry}\n\n${getPostActionPrompt(allowDeviceSelection)}`
      );
      break;
    }

    case 'invoice': {
      const lastInvoice = await prisma.invoice.findFirst({
        where: { customerIdentifier: String(userId) },
        orderBy: { createdAt: 'desc' },
      });
      if (lastInvoice) {
        await sendChatbotMessage(
          phoneNumber,
          `🧾 Last Invoice for ${device.name}:\n\nID: #${lastInvoice.id}\nAmount: ${lastInvoice.totalAmount}\nStatus: ${lastInvoice.status.toUpperCase()}\nCreated: ${formatDate(lastInvoice.createdAt, 'dd MMM yyyy')}\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      } else {
        await sendChatbotMessage(
          phoneNumber,
          `No invoices found for ${device.name}.\n\n${getPostActionPrompt(allowDeviceSelection)}`
        );
      }
      break;
    }
  }

  if (!['stop engine', 'resume engine'].includes(command)) {
    await scheduleFollowUpMessage(phoneNumber);
  }

  if (!['stop engine', 'resume engine'].includes(command)) {
    if (allowDeviceSelection) {
      await prisma.userSession.update({
        where: { phoneNumber },
        data: { lastAction: 'SELECT_DEVICE', lastCommand: command, selectedDeviceId: null },
      });
    } else {
      await prisma.userSession.update({
        where: { phoneNumber },
        data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
      });
    }
  }
}

function getDeviceExpiryInfo(device: Device) {
  const rawExpiry = device.attributes?.expiryDate || device.expirationTime;
  if (!rawExpiry) {
    return { isExpired: false, formattedExpiry: null as string | null };
  }

  const expiryDate = new Date(rawExpiry);
  if (Number.isNaN(expiryDate.getTime())) {
    return { isExpired: false, formattedExpiry: null as string | null };
  }

  return {
    isExpired: expiryDate.getTime() < Date.now(),
    formattedExpiry: formatDate(expiryDate, 'dd MMM yyyy'),
  };
}

async function executeEngineCommand(phoneNumber: string, command: string, device: Device) {
  try {
    const password = device.attributes.devicePassword;
    const customCommand = command === 'stop engine' ? `STOP,${password}#` : `RESUME,${password}#`;

    await apiClient.post('/commands/send', {
      deviceId: device.id,
      type: 'custom',
      attributes: { data: customCommand },
    });

    await sendChatbotMessage(
      phoneNumber,
      `✅ Command '${command}' sent successfully to ${device.name}.\n\nType M to return to main menu.`
    );
  } catch {
    await sendChatbotMessage(
      phoneNumber,
      `❌ Failed to send command to ${device.name}.\n\nType M to return to main menu.`
    );
  } finally {
    await prisma.userSession.update({
      where: { phoneNumber },
      data: { lastAction: null, lastCommand: null, selectedDeviceId: null },
    });
  }
}
