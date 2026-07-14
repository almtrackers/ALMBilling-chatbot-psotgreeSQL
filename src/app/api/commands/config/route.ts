import { NextResponse } from 'next/server';
import { getSmsGatewayConfig } from '@/lib/traccar-sms-gateway';

export async function GET() {
  const config = getSmsGatewayConfig();
  const gatewayReady = config.enabled && Boolean(config.url) && Boolean(config.token);
  return NextResponse.json({
    smsEnabled: gatewayReady,
    gatewayEnabled: config.enabled,
    gatewayReady,
    autoSmsWhenOffline: config.autoSmsWhenOffline,
    hasToken: Boolean(config.token),
  });
}
