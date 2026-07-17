import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { traccarClient } from '@/lib/traccar-client';
import { getSessionUser } from '@/lib/server-auth';

type TraccarDevice = {
  id: number;
  name: string;
  uniqueId: string;
  [key: string]: unknown;
};

function parseImeis(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function devicePayload(device: TraccarDevice, overrides: Record<string, unknown> = {}) {
  const { position, status, lastUpdate, ...payload } = device;
  return { ...payload, ...overrides };
}

export async function POST(req: NextRequest) {
  const sessionUser = await getSessionUser(req);
  if (sessionUser?.administrator !== true) {
    return NextResponse.json(
      { success: false, message: 'Traccar administrator login required.' },
      { status: 401 }
    );
  }

  let oldDevice: TraccarDevice | undefined;
  let replacementDevice: TraccarDevice | undefined;
  let replacementDeleted = false;
  let oldDeviceChanged = false;

  try {
    const body = await req.json();
    const recordId = String(body.recordId || '');
    const recordType = body.recordType === 'companyVehicle' ? 'companyVehicle' : 'sale';
    const replacementDeviceId = Number(body.replacementDeviceId);
    const replacementImei = String(body.replacementImei || '').trim();
    const newTrackerId = String(body.newTrackerId || '');
    const oldTrackerCondition = body.oldTrackerCondition === 'working' ? 'working' : 'faulty';
    const reason = String(body.reason || '').trim();
    const billingOnly = body.billingOnly === true;

    if (
      !recordId ||
      !Number.isInteger(replacementDeviceId) ||
      !replacementImei ||
      !newTrackerId ||
      !reason
    ) {
      return NextResponse.json(
        { success: false, message: 'Vehicle, replacement tracker, and reason are required.' },
        { status: 400 }
      );
    }

    const record =
      recordType === 'companyVehicle'
        ? await prisma.companyVehicle.findUnique({ where: { id: recordId } })
        : await prisma.sale.findUnique({ where: { id: recordId } });

    if (!record?.imei) {
      return NextResponse.json(
        { success: false, message: 'The selected vehicle has no existing IMEI.' },
        { status: 404 }
      );
    }
    if (record.imei === replacementImei) {
      return NextResponse.json(
        { success: false, message: 'The selected vehicle already uses this IMEI.' },
        { status: 409 }
      );
    }

    const inventoryItem = await prisma.inventoryItem.findUnique({ where: { id: newTrackerId } });
    if (!inventoryItem || !parseImeis(inventoryItem.imeis).includes(replacementImei)) {
      return NextResponse.json(
        { success: false, message: 'Replacement IMEI is not available in tracker inventory.' },
        { status: 409 }
      );
    }

    if (!billingOnly) {
      const devicesResponse = await traccarClient.get<TraccarDevice[]>('/devices');
      const devices = Array.isArray(devicesResponse.data) ? devicesResponse.data : [];
      oldDevice = devices.find((device) => device.uniqueId === record.imei);
      replacementDevice = devices.find((device) => device.id === replacementDeviceId);

      if (!oldDevice) {
        return NextResponse.json(
          { success: false, message: `Old device IMEI ${record.imei} was not found in Traccar.` },
          { status: 404 }
        );
      }
      if (!replacementDevice || replacementDevice.uniqueId !== replacementImei) {
        return NextResponse.json(
          { success: false, message: 'The replacement device was not found in Traccar.' },
          { status: 404 }
        );
      }

      // The replacement IMEI currently belongs to the newly detected, unbilled
      // Traccar device. Remove that temporary record, then put the IMEI on the
      // older vehicle's Traccar device so its history and permissions are kept.
      await traccarClient.delete(`/devices/${replacementDevice.id}`);
      replacementDeleted = true;
      await traccarClient.put(
        `/devices/${oldDevice.id}`,
        devicePayload(oldDevice, { uniqueId: replacementImei })
      );
      oldDeviceChanged = true;
    }

    await prisma.$transaction(async (tx) => {
      const newItem = await tx.inventoryItem.findUnique({ where: { id: newTrackerId } });
      if (!newItem) throw new Error('Replacement tracker inventory item no longer exists.');

      const newImeis = parseImeis(newItem.imeis);
      if (!newImeis.includes(replacementImei)) {
        throw new Error('Replacement IMEI is no longer available in inventory.');
      }
      await tx.inventoryItem.update({
        where: { id: newTrackerId },
        data: {
          imeis: JSON.stringify(newImeis.filter((imei) => imei !== replacementImei)),
          quantity: { decrement: 1 },
          lastUpdated: new Date(),
        },
      });

      if (oldTrackerCondition === 'working' && record.trackerId && record.imei) {
        const oldItem = await tx.inventoryItem.findUnique({ where: { id: record.trackerId } });
        if (oldItem) {
          const oldImeis = parseImeis(oldItem.imeis);
          if (!oldImeis.includes(record.imei)) {
            await tx.inventoryItem.update({
              where: { id: oldItem.id },
              data: {
                imeis: JSON.stringify([...oldImeis, record.imei]),
                quantity: { increment: 1 },
                lastUpdated: new Date(),
              },
            });
          }
        }
      }

      const data = { imei: replacementImei, trackerId: newTrackerId };
      if (recordType === 'companyVehicle') {
        await tx.companyVehicle.update({ where: { id: recordId }, data });
      } else {
        await tx.sale.update({ where: { id: recordId }, data });
      }

      await tx.log.create({
        data: {
          action: `Quick hardware replacement for ${record.vehicleNumber}: ${record.imei} → ${replacementImei}. Reason: ${reason}${billingOnly ? ' (billing record only; Traccar already updated manually)' : ''}`,
          adminName: sessionUser.name || sessionUser.email || 'Admin',
          type: 'update',
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `${record.vehicleNumber} now uses IMEI ${replacementImei}${billingOnly ? ' in billing records. Traccar was not changed.' : '.'}`,
    });
  } catch (error: unknown) {
    // Best-effort Traccar rollback if the billing transaction fails.
    try {
      if (oldDeviceChanged && oldDevice) {
        await traccarClient.put(`/devices/${oldDevice.id}`, devicePayload(oldDevice));
      }
      if (replacementDeleted && replacementDevice) {
        const { id, ...createPayload } = devicePayload(replacementDevice);
        await traccarClient.post('/devices', createPayload);
      }
    } catch (rollbackError) {
      console.error('Quick replacement Traccar rollback failed:', rollbackError);
    }

    const message = error instanceof Error ? error.message : 'Hardware replacement failed.';
    console.error('Quick hardware replacement failed:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
