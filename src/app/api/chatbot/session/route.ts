import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { getPhoneLookupVariants, normalizePhoneNumber } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { phoneNumber, action, agentName } = await req.json();
    const normalized = normalizePhoneNumber(phoneNumber || '');
    const normalizedPhone = normalized.local || normalized.digits || normalized.raw;
    const phoneLookupVariants = getPhoneLookupVariants(phoneNumber || '');

    if (!phoneNumber || !action) {
      return NextResponse.json({ error: 'Phone number and action are required' }, { status: 400 });
    }

    const existingSession = await prisma.userSession.findFirst({
      where: { phoneNumber: { in: phoneLookupVariants } },
      select: { phoneNumber: true },
    });
    const sessionPhoneNumber = existingSession?.phoneNumber || normalizedPhone;

    if (action === 'assign') {
      const session = await prisma.userSession.upsert({
        where: { phoneNumber: sessionPhoneNumber },
        update: {
          phoneNumber: normalizedPhone,
          isAssigned: true,
          assignedTo: agentName || 'Agent',
          sessionStatus: 'agent',
          lastAction: null,
          lastCommand: null,
          selectedDeviceId: null,
        },
        create: {
          phoneNumber: normalizedPhone,
          isAssigned: true,
          assignedTo: agentName || 'Agent',
          sessionStatus: 'agent',
          lastAction: null,
          lastCommand: null,
          selectedDeviceId: null,
        },
      });

      await sendWhatsAppMessage(normalizedPhone, `Agent ${agentName || 'Agent'} has joined the chat to assist you.`);

      return NextResponse.json({ success: true, session });
    }

    if (action === 'close') {
      const session = await prisma.userSession.update({
        where: { phoneNumber: sessionPhoneNumber },
        data: {
          phoneNumber: normalizedPhone,
          isAssigned: false,
          assignedTo: null,
          sessionStatus: 'bot',
          lastAction: null,
          lastCommand: null,
        },
      });

      await sendWhatsAppMessage(
        normalizedPhone,
        'The chat session has been closed. We hope we were able to assist you! Please leave a review of our service.'
      );

      return NextResponse.json({ success: true, session });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('Session API Error:', error);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
