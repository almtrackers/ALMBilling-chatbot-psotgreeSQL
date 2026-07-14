import axios from 'axios';
import { toSmsE164 } from '@/lib/utils';

export type SmsGatewayConfig = {
  enabled: boolean;
  url: string;
  token: string;
  autoSmsWhenOffline: boolean;
};

export function getSmsGatewayConfig(): SmsGatewayConfig {
  return {
    enabled: process.env.TRACCAR_SMS_GATEWAY_ENABLED === 'true',
    url: (process.env.TRACCAR_SMS_GATEWAY_URL || 'https://www.traccar.org/sms/').replace(/\/$/, '') + '/',
    token: process.env.TRACCAR_SMS_GATEWAY_TOKEN || '',
    autoSmsWhenOffline: process.env.TRACCAR_SMS_AUTO_OFFLINE !== 'false',
  };
}

export function resolveDeviceSmsPhone(device: {
  phone?: string | null;
  attributes?: Record<string, unknown>;
}): string | null {
  const candidates = [
    device.phone,
    device.attributes?.phone,
    device.attributes?.phoneRobocall,
    device.attributes?.simNumber,
    device.attributes?.mobile,
  ];

  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const e164 = toSmsE164(raw);
    if (e164) return e164;
  }
  return null;
}

/**
 * Direct HTTP call to Traccar SMS Gateway.
 * Body: { "to": "+923001234567", "message": "..." }
 * Configure via TRACCAR_SMS_GATEWAY_URL and TRACCAR_SMS_GATEWAY_TOKEN in .env
 */
export async function sendSmsViaGateway(phone: string, message: string) {
  const config = getSmsGatewayConfig();
  if (!config.enabled) {
    throw new Error('SMS gateway is not enabled. Set TRACCAR_SMS_GATEWAY_ENABLED=true in .env');
  }
  if (!config.token) {
    throw new Error('SMS gateway token missing. Set TRACCAR_SMS_GATEWAY_TOKEN in .env');
  }

  const to = toSmsE164(phone);
  if (!to) {
    throw new Error(
      `Invalid SIM/phone "${phone}". Expected format like 03001234567 → sent as +923001234567`
    );
  }

  const response = await axios.post(
    config.url,
    {
      to,
      message,
    },
    {
      headers: {
        Authorization: config.token,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    const detail =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data || { status: response.status });
    throw new Error(`SMS gateway error (${response.status}): ${detail}`);
  }

  return { data: response.data, to };
}
