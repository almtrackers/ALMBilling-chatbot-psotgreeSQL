
'use client';

import { useMemo } from 'react';
import { useDevices } from './use-devices';
import { useInvoices } from './use-invoices';
import { useAppSettings } from './use-app-settings';
import { parseISO, addDays, differenceInCalendarDays, isAfter } from 'date-fns';
import { useTraccarUsers } from './use-traccar-users';

const EXPIRY_LOOKAHEAD_DAYS = 7;

// Structural type — matches both the websocket context device and lib/types Device.
type BillableDevice = {
  id: number;
  name: string;
  uniqueId: string;
  expirationTime?: string;
  attributes?: Record<string, unknown>;
};

export type DeviceDueForInvoice = BillableDevice & {
  userName?: string;
  expiryDate?: Date;
  daysLeft?: number;
};

function getExpiryDate(device: BillableDevice): Date | null {
  const raw =
    device.attributes?.expiryDate ||
    device.attributes?.renewalDate ||
    device.attributes?.renewal_date ||
    device.expirationTime;
  if (!raw) return null;
  let parsed = typeof raw === 'string' ? parseISO(raw) : new Date(String(raw));
  if (isNaN(parsed.getTime())) parsed = new Date(String(raw));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getRenewalFee(device: BillableDevice): number {
  const attributes = device.attributes;
  return (
    Number(
      attributes?.renewalFee ||
        attributes?.renewal_fee ||
        attributes?.renewlFee ||
        attributes?.renewal_charge
    ) || 0
  );
}

export function useInvoiceGenerationStatus() {
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const { invoicesWithDetails, isLoading: isLoadingInvoices } = useInvoices();
  const { users, isLoading: isLoadingUsers } = useTraccarUsers();
  const { isLoading: isLoadingSettings } = useAppSettings();

  const isLoading = isLoadingDevices || isLoadingInvoices || isLoadingUsers || isLoadingSettings;

  const devicesDueForInvoice: DeviceDueForInvoice[] = useMemo(() => {
    if (!devices || !invoicesWithDetails || !users) {
      return [];
    }

    const now = new Date();
    const lookahead = addDays(now, EXPIRY_LOOKAHEAD_DAYS);

    return (devices as BillableDevice[])
      .filter((device) => {
        // Only billable devices without an active manual extension.
        if (getRenewalFee(device) === 0) return false;
        const ext = Number(device.attributes?.EXT) || 0;
        if (ext > 0) return false;

        const expiryDate = getExpiryDate(device);
        if (!expiryDate) return false;

        // Warn from 7 days before expiry, and keep warning after expiry.
        if (isAfter(expiryDate, lookahead)) return false;

        // Suppress when any invoice (pending or paid) already covers the upcoming period.
        const covered = invoicesWithDetails.some(
          ({ invoice }) =>
            (invoice.status === 'pending' || invoice.status === 'paid') &&
            invoice.deviceIds.includes(device.id) &&
            invoice.periodEnd &&
            new Date(invoice.periodEnd as unknown as string) >= expiryDate
        );
        return !covered;
      })
      .map((device) => {
        const ownerId = Number(device.attributes?.uId || device.attributes?.userId || 0);
        const user = users?.find((u) => u.id === ownerId);
        const expiryDate = getExpiryDate(device)!;
        return {
          ...device,
          userName: user?.name || 'Unknown Customer',
          expiryDate,
          daysLeft: differenceInCalendarDays(expiryDate, now),
        };
      })
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  }, [devices, invoicesWithDetails, users]);

  return {
    devicesDueForInvoice,
    isLoading,
    totalDevices: devices?.length || 0,
    invoicesGeneratedThisMonth: invoicesWithDetails?.filter(inv => {
      const invDate = new Date(inv.invoice.createdAt as unknown as string);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      return isAfter(invDate, startOfMonth);
    }).length || 0
  };
}
