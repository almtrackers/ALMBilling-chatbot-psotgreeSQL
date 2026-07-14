'use client';

import { apiClient } from './api';
import type { Device } from './types';

/**
 * Replace a Traccar device's uniqueId (IMEI) in place — keeps the same device id,
 * permissions, history, and attributes. Does not delete or recreate the device.
 */
export async function replaceTraccarDeviceIdentifier(
  deviceId: number,
  newUniqueId: string
): Promise<Device> {
  const trimmedId = newUniqueId.trim();
  if (!trimmedId) {
    throw new Error('New IMEI is required.');
  }

  const allDevicesRes = await apiClient.get<Device[]>('/devices');
  if (allDevicesRes.status !== 200) {
    throw new Error('Could not fetch devices from the server.');
  }

  const conflict = allDevicesRes.data.find(
    (d) => d.uniqueId === trimmedId && d.id !== deviceId
  );
  if (conflict) {
    throw new Error(
      `IMEI ${trimmedId} is already used by device "${conflict.name}" (ID ${conflict.id}).`
    );
  }

  const deviceRes = await apiClient.get<Device[]>(`/devices?id=${deviceId}`);
  if (deviceRes.status !== 200 || deviceRes.data.length === 0) {
    throw new Error(`Could not fetch device with ID ${deviceId} from the server.`);
  }

  const deviceToUpdate = deviceRes.data[0];
  const { position: _, userId: __, ...payload } = deviceToUpdate as Device & {
    position?: unknown;
  };

  const response = await apiClient.put<Device>(`/devices/${deviceId}`, {
    ...payload,
    uniqueId: trimmedId,
  });

  if (response.status !== 200) {
    throw new Error(`Server API responded with status ${response.status}`);
  }

  return response.data;
}
