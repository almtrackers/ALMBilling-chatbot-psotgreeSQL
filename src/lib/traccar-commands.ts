import { traccarClient } from '@/lib/traccar-client';
import type { Device } from '@/lib/types';
import prisma from '@/lib/prisma/client';
import { toSmsE164 } from '@/lib/utils';
import {
  getSmsGatewayConfig,
  resolveDeviceSmsPhone,
  sendSmsViaGateway,
} from '@/lib/traccar-sms-gateway';

export type CommandChannel = 'network' | 'sms';

export type SendDeviceCommandOptions = {
  /** auto = network when online, SMS when offline (if enabled) */
  channel?: 'auto' | CommandChannel;
  /** User-edited SIM/phone override before sending SMS */
  smsTo?: string;
};

export type DeviceSimInfo = {
  deviceId: number;
  deviceName: string;
  simNumber: string | null;
  imsi: string | null;
  smsTo: string | null;
  source: 'sale' | 'device' | null;
};

export type SendDeviceCommandResult = {
  deviceId: number;
  deviceName: string;
  command: string;
  channel: CommandChannel;
  status: 'sent' | 'queued' | 'failed';
  detail?: string;
  /** Tracker SIM from sale record (SIM / IMSI column) */
  simNumber?: string | null;
  imsi?: string | null;
};

async function fetchDevice(deviceId: number): Promise<Device & { phone?: string }> {
  const response = await traccarClient.get<Device[]>(`/devices?id=${deviceId}`);
  const device = response.data?.[0];
  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }
  return device;
}

/** Lookup sale by device IMEI (uniqueId) — uses SIM / IMSI from sales table */
async function findSaleSimByImei(imei: string): Promise<{
  simNumber: string | null;
  imsi: string | null;
  vehicleNumber: string | null;
} | null> {
  if (!imei?.trim()) return null;

  const sale = await prisma.sale.findFirst({
    where: {
      imei: imei.trim(),
      status: { not: 'unsubscribed' },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      simNumber: true,
      imsi: true,
      vehicleNumber: true,
    },
  });

  if (!sale) {
    // Fallback: any sale with this IMEI (including unsubscribed)
    const anySale = await prisma.sale.findFirst({
      where: { imei: imei.trim() },
      orderBy: { createdAt: 'desc' },
      select: {
        simNumber: true,
        imsi: true,
        vehicleNumber: true,
      },
    });
    if (!anySale) return null;
    return {
      simNumber: anySale.simNumber?.trim() || null,
      imsi: anySale.imsi?.trim() || null,
      vehicleNumber: anySale.vehicleNumber?.trim() || null,
    };
  }

  return {
    simNumber: sale.simNumber?.trim() || null,
    imsi: sale.imsi?.trim() || null,
    vehicleNumber: sale.vehicleNumber?.trim() || null,
  };
}

function normalizeSmsPhone(raw: string): string | null {
  return toSmsE164(raw);
}

function pickChannel(
  device: Device,
  options?: SendDeviceCommandOptions
): CommandChannel {
  const forced = options?.channel;
  if (forced === 'network' || forced === 'sms') return forced;

  const smsConfig = getSmsGatewayConfig();
  if (device.status === 'online') return 'network';
  if (smsConfig.autoSmsWhenOffline && smsConfig.enabled) return 'sms';
  return 'network';
}

/** Fetch SIM / IMSI from sale record (and device fallback) for preview before send */
export async function getDeviceSimInfo(deviceId: number): Promise<DeviceSimInfo> {
  const device = await fetchDevice(deviceId);
  const saleSim = await findSaleSimByImei(device.uniqueId);
  const simNumber = saleSim?.simNumber || null;
  const imsi = saleSim?.imsi || null;

  const phoneFromSale = simNumber ? normalizeSmsPhone(simNumber) : null;
  const phoneFromDevice = resolveDeviceSmsPhone(device);
  const smsTo = phoneFromSale || phoneFromDevice;

  return {
    deviceId: device.id,
    deviceName: device.name,
    simNumber,
    imsi,
    smsTo,
    source: phoneFromSale ? 'sale' : phoneFromDevice ? 'device' : null,
  };
}

export async function sendDeviceCommand(
  deviceId: number,
  command: string,
  options?: SendDeviceCommandOptions
): Promise<SendDeviceCommandResult> {
  const device = await fetchDevice(deviceId);
  const channel = pickChannel(device, options);
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('Command cannot be empty');
  }

  const saleSim = await findSaleSimByImei(device.uniqueId);
  const simNumber = saleSim?.simNumber || null;
  const imsi = saleSim?.imsi || null;

  if (channel === 'sms') {
    const phoneOverride = options?.smsTo?.trim()
      ? normalizeSmsPhone(options.smsTo.trim())
      : null;
    const phoneFromSale = simNumber ? normalizeSmsPhone(simNumber) : null;
    const phoneFromDevice = resolveDeviceSmsPhone(device);
    const phone = phoneOverride || phoneFromSale || phoneFromDevice;

    if (!phone) {
      throw new Error(
        `No SIM number for vehicle ${device.name}. Enter a SIM number or add SIM / IMSI on the sale record (IMEI ${device.uniqueId}).`
      );
    }

    const smsConfig = getSmsGatewayConfig();
    if (!smsConfig.enabled) {
      throw new Error('SMS gateway disabled. Set TRACCAR_SMS_GATEWAY_ENABLED=true in .env');
    }

    // Prefer gateway with the sale SIM number (known destination)
    try {
      const gatewayResult = await sendSmsViaGateway(phone, trimmed);
      const sentTo = gatewayResult.to;
      return {
        deviceId: device.id,
        deviceName: device.name,
        command: trimmed,
        channel: 'sms',
        status: 'sent',
        detail: `SMS sent via gateway to ${sentTo}`,
        simNumber: sentTo,
        imsi,
      };
    } catch (gatewayError) {
      try {
        await traccarClient.post('/commands/send', {
          deviceId: device.id,
          type: 'custom',
          textChannel: true,
          attributes: { data: trimmed },
        });
        return {
          deviceId: device.id,
          deviceName: device.name,
          command: trimmed,
          channel: 'sms',
          status: 'sent',
          detail: `SMS sent via Traccar to ${phone}`,
          simNumber: phone,
          imsi,
        };
      } catch (traccarError) {
        const msg =
          gatewayError instanceof Error ? gatewayError.message : String(gatewayError);
        const traccarMsg =
          traccarError instanceof Error ? traccarError.message : String(traccarError);
        throw new Error(`SMS failed. Gateway: ${msg}. Traccar: ${traccarMsg}`);
      }
    }
  }

  try {
    await traccarClient.post('/commands/send', {
      deviceId: device.id,
      type: 'custom',
      textChannel: false,
      attributes: { data: trimmed },
    });
    return {
      deviceId: device.id,
      deviceName: device.name,
      command: trimmed,
      channel: 'network',
      status: device.status === 'online' ? 'sent' : 'queued',
      detail:
        device.status === 'online'
          ? 'Command sent over network'
          : 'Device offline — command queued until online',
      simNumber,
      imsi,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send command: ${message}`);
  }
}
