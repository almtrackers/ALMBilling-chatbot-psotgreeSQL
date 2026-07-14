import type { Device, Sale } from '@/lib/types';
import { differenceInDays, format, isValid, parseISO } from 'date-fns';

export type MonitorDisplayStatus = 'expired' | 'offline' | 'unknown';
export type MonitorStatusFilter = 'all' | MonitorDisplayStatus;

export type MonitorDevicePosition = {
  latitude: number;
  longitude: number;
  mapLink: string;
};

export type MonitorDeviceDetails = {
  displayStatus: MonitorDisplayStatus;
  isExpired: boolean;
  expiryDate: Date | null;
  expiryLabel: string;
  offlineDays: number;
  simNumber: string | null;
  phoneRobocall: string | null;
  customerName: string;
  coordinates: MonitorDevicePosition | null;
};

export function getDeviceExpiryDate(device: Device): Date | null {
  const rawExpiry = device.attributes?.expiryDate || device.expirationTime;
  if (!rawExpiry || typeof rawExpiry !== 'string') return null;
  try {
    const expiryDate = parseISO(rawExpiry);
    return isValid(expiryDate) ? expiryDate : null;
  } catch {
    return null;
  }
}

export function isDeviceExpired(device: Device, now = new Date()): boolean {
  const expiryDate = getDeviceExpiryDate(device);
  return expiryDate ? expiryDate.getTime() < now.getTime() : false;
}

/** Expired devices are shown as expired, not offline. */
export function getMonitorDisplayStatus(device: Device, now = new Date()): MonitorDisplayStatus {
  if (isDeviceExpired(device, now)) return 'expired';
  if (device.status === 'unknown') return 'unknown';
  if (device.status === 'offline') return 'offline';
  return 'unknown';
}

export function isMonitorCandidate(device: Device, now = new Date()): boolean {
  if (device.status === 'online') {
    return isDeviceExpired(device, now);
  }
  return device.status === 'offline' || device.status === 'unknown' || isDeviceExpired(device, now);
}

export function matchesMonitorStatusFilter(
  displayStatus: MonitorDisplayStatus,
  filter: MonitorStatusFilter
): boolean {
  if (filter === 'all') return true;
  return displayStatus === filter;
}

export type MonitorDateField = 'lastUpdate' | 'expiry';

export function getMonitorDateFieldValue(
  device: Device,
  field: MonitorDateField
): Date | null {
  if (field === 'expiry') {
    return getDeviceExpiryDate(device);
  }
  if (!device.lastUpdate) return null;
  try {
    const date = parseISO(device.lastUpdate);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

export function matchesMonitorDateRange(
  device: Device,
  field: MonitorDateField,
  from?: Date,
  to?: Date
): boolean {
  if (!from && !to) return true;
  const value = getMonitorDateFieldValue(device, field);
  if (!value) return false;

  const start = from ? new Date(from) : null;
  if (start) start.setHours(0, 0, 0, 0);

  const end = to ? new Date(to) : start ? new Date(start) : null;
  if (end) end.setHours(23, 59, 59, 999);

  if (start && value < start) return false;
  if (end && value > end) return false;
  return true;
}

export function getOfflineDays(device: Device, now = new Date()): number {
  if (!device.lastUpdate) return 999;
  try {
    const lastUpdateDate = parseISO(device.lastUpdate);
    if (!isValid(lastUpdateDate)) return 999;
    return Math.max(0, differenceInDays(now, lastUpdateDate));
  } catch {
    return 999;
  }
}

export function buildImeiToSaleMap(sales: Sale[] | undefined): Map<string, Sale> {
  const map = new Map<string, Sale>();
  sales?.forEach((sale) => {
    if (sale.imei) map.set(sale.imei, sale);
  });
  return map;
}

export function getSimNumberForDevice(device: Device, salesByImei: Map<string, Sale>): string | null {
  const sale = salesByImei.get(device.uniqueId);
  if (sale?.simNumber) return sale.simNumber;
  const attrSim = device.attributes?.simNumber;
  return typeof attrSim === 'string' && attrSim.trim() ? attrSim.trim() : null;
}

export function getCoordinatesForDevice(
  device: Device,
  positionsByDeviceId: Map<number, { latitude: number; longitude: number }>
): MonitorDevicePosition | null {
  const position =
    positionsByDeviceId.get(device.id) ||
    (device.positionId ? positionsByDeviceId.get(device.positionId) : undefined);

  if (!position?.latitude || !position?.longitude) return null;

  const latitude = Number(position.latitude);
  const longitude = Number(position.longitude);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

  return {
    latitude,
    longitude,
    mapLink: `https://www.google.com/maps?q=${latitude},${longitude}`,
  };
}

export function buildMonitorDeviceDetails(
  device: Device,
  options: {
    salesByImei: Map<string, Sale>;
    positionsByDeviceId: Map<number, { latitude: number; longitude: number }>;
    customerName?: string;
    now?: Date;
  }
): MonitorDeviceDetails {
  const now = options.now ?? new Date();
  const expiryDate = getDeviceExpiryDate(device);
  const displayStatus = getMonitorDisplayStatus(device, now);
  const sale = options.salesByImei.get(device.uniqueId);

  return {
    displayStatus,
    isExpired: displayStatus === 'expired',
    expiryDate,
    expiryLabel: expiryDate ? format(expiryDate, 'PP') : 'N/A',
    offlineDays: getOfflineDays(device, now),
    simNumber: getSimNumberForDevice(device, options.salesByImei),
    phoneRobocall:
      (typeof device.attributes?.phoneRobocall === 'string' && device.attributes.phoneRobocall) ||
      (typeof device.attributes?.phone === 'string' && device.attributes.phone) ||
      sale?.phoneRobocall ||
      sale?.contactNumber ||
      null,
    customerName:
      options.customerName ||
      sale?.customerName ||
      (typeof device.attributes?.customerName === 'string' ? device.attributes.customerName : undefined) ||
      'Unknown Customer',
    coordinates: getCoordinatesForDevice(device, options.positionsByDeviceId),
  };
}

export function getMonitorStatusBadgeVariant(
  status: MonitorDisplayStatus
): 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'expired':
      return 'destructive';
    case 'offline':
      return 'destructive';
    case 'unknown':
    default:
      return 'secondary';
  }
}

export function getMonitorStatusLabel(status: MonitorDisplayStatus): string {
  switch (status) {
    case 'expired':
      return 'Expired';
    case 'offline':
      return 'Offline';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

export function buildMonitorDevicesExportCsv(
  rows: Array<{
    deviceName: string;
    customerName: string;
    phone: string;
    simNumber: string;
    latitude: string;
    longitude: string;
    mapLink: string;
    status: string;
    expiryDate: string;
    offlineDays: string;
    imei: string;
  }>
): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = [
    'Device Name',
    'Customer',
    'Phone',
    'SIM Number',
    'Latitude',
    'Longitude',
    'Map Link',
    'Status',
    'Expiry Date',
    'Offline Days',
    'IMEI',
  ];
  const lines = rows.map((row) =>
    [
      escape(row.deviceName),
      escape(row.customerName),
      escape(row.phone),
      escape(row.simNumber),
      escape(row.latitude),
      escape(row.longitude),
      escape(row.mapLink),
      escape(row.status),
      escape(row.expiryDate),
      escape(row.offlineDays),
      escape(row.imei),
    ].join(',')
  );
  return [header.join(','), ...lines].join('\n');
}
