import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { traccarClient } from '@/lib/traccar-client';
import { getRenewalFee, isStaffTraccarUser } from '@/lib/wallet-sync';

export const dynamic = 'force-dynamic';

type TraccarUser = {
  id: number;
  name?: string;
  administrator?: boolean;
  manager?: boolean;
  userLimit?: number;
};

type TraccarDevice = {
  id: number;
  name: string;
  uniqueId: string;
  attributes?: Record<string, unknown>;
};

/**
 * Traccar devices that are not connected to any wallet and are not
 * company vehicles — these run without billing and need attention.
 */
export async function GET() {
  try {
    const [devicesRes, usersRes, walletDevices, companyVehicles] = await Promise.all([
      traccarClient.get<TraccarDevice[]>('/devices'),
      traccarClient.get<TraccarUser[]>('/users'),
      prisma.walletDevice.findMany({ select: { traccarDeviceId: true } }),
      prisma.companyVehicle.findMany({ select: { imei: true } }),
    ]);

    const devices = Array.isArray(devicesRes.data) ? devicesRes.data : [];
    const usersById = new Map((usersRes.data || []).map((u) => [u.id, u]));
    const linkedIds = new Set(walletDevices.map((d) => d.traccarDeviceId));
    const companyImeis = new Set(
      companyVehicles.map((v) => v.imei).filter((imei): imei is string => Boolean(imei))
    );

    const unlinked = devices
      .filter((device) => !linkedIds.has(device.id) && !companyImeis.has(device.uniqueId))
      .map((device) => {
        const attributes = device.attributes || {};
        const ownerId = Number(attributes.uId || attributes.userId || 0) || 0;
        const owner = ownerId ? usersById.get(ownerId) : undefined;
        const fee = getRenewalFee(attributes);

        let reason: string;
        if (!ownerId) reason = 'No owner (uId attribute missing)';
        else if (!owner) reason = `Owner ${ownerId} not found in Traccar`;
        else if (fee <= 0) reason = 'No subscription fee (renewalFee missing)';
        else if (isStaffTraccarUser(owner)) reason = `Staff-owned (${owner.name || ownerId}) — create wallet manually`;
        else reason = 'Not yet synced — run Sync & Recalculate';

        return {
          id: device.id,
          name: device.name,
          uniqueId: device.uniqueId,
          ownerName: owner?.name || null,
          renewalFee: fee,
          reason,
        };
      });

    return NextResponse.json({ success: true, devices: unlinked });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load unlinked devices';
    console.error('Wallet unlinked-devices API Error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
