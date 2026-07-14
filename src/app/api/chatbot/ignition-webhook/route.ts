import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

function extractDeviceId(payload: any) {
  return (
    payload?.deviceId ??
    payload?.event?.deviceId ??
    payload?.attributes?.deviceId ??
    payload?.notification?.deviceId ??
    null
  );
}

function extractEventLabel(payload: any) {
  return (
    payload?.alarm ||
    payload?.attributes?.alarm ||
    payload?.event?.type ||
    payload?.event?.attributes?.alarm ||
    payload?.type ||
    payload?.message ||
    ''
  );
}

function isIgnitionEvent(payload: any) {
  const label = String(extractEventLabel(payload)).toLowerCase();
  if (!label) return false;
  return label.includes('ignition') || label.includes('poweron') || label.includes('power on');
}

function extractEventTime(payload: any) {
  return (
    payload?.eventTime ||
    payload?.serverTime ||
    payload?.event?.serverTime ||
    payload?.event?.eventTime ||
    payload?.event?.deviceTime ||
    payload?.deviceTime ||
    new Date().toISOString()
  );
}

export async function POST(req: NextRequest) {
  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
  }

  if (!payload || !isIgnitionEvent(payload)) {
    return NextResponse.json({ success: true });
  }

  const deviceId = extractDeviceId(payload);
  if (!deviceId) {
    return NextResponse.json({ success: false, message: 'Device ID missing' }, { status: 400 });
  }

  const walletDevice = await prisma.walletDevice.findUnique({
    where: { traccarDeviceId: Number(deviceId) },
    include: { user: { include: { registrationNumbers: true } } },
  });

  if (!walletDevice?.user) {
    const device = await prisma.device.findUnique({ where: { id: Number(deviceId) } });
    if (!device?.userId) {
      return NextResponse.json({ success: true });
    }

    const user = await prisma.user.findUnique({
      where: { traccarId: device.userId },
      include: { registrationNumbers: true },
    });

    if (!user || user.registrationNumbers.length === 0) {
      return NextResponse.json({ success: true });
    }

    const deviceName = device.name || payload?.deviceName || `Device ${deviceId}`;
    const eventTime = extractEventTime(payload);
    const message = `🚗 ${deviceName} ignition ON.\nTime: ${eventTime}`;
    await Promise.all(user.registrationNumbers.map((n) => sendWhatsAppMessage(n.number, message)));
    return NextResponse.json({ success: true });
  }

  const numbers = walletDevice.user.registrationNumbers.map((n) => n.number);
  if (numbers.length === 0) {
    return NextResponse.json({ success: true });
  }

  const deviceName = walletDevice.name || payload?.deviceName || `Device ${deviceId}`;
  const eventTime = extractEventTime(payload);
  const message = `🚗 ${deviceName} ignition ON.\nTime: ${eventTime}`;

  await Promise.all(numbers.map((number) => sendWhatsAppMessage(number, message)));

  return NextResponse.json({ success: true });
}
