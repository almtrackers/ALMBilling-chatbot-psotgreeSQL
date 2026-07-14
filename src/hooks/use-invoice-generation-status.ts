
'use client';

import { useMemo } from 'react';
import { useDevices } from './use-devices';
import { useInvoices } from './use-invoices';
import { useAppSettings } from './use-app-settings';
import type { AppSettings, Device } from '@/lib/types';
import { parseISO, subDays, isAfter } from 'date-fns';
import { useTraccarUsers } from './use-traccar-users';

export type DeviceDueForInvoice = Device & {
  userName?: string;
};

export function useInvoiceGenerationStatus() {
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const { invoicesWithDetails, isLoading: isLoadingInvoices } = useInvoices();
  const { users, isLoading: isLoadingUsers } = useTraccarUsers();
  const { appSettings, isLoading: isLoadingSettings } = useAppSettings();

  const isLoading = isLoadingDevices || isLoadingInvoices || isLoadingUsers || isLoadingSettings;

  const devicesDueForInvoice: DeviceDueForInvoice[] = useMemo(() => {
    if (!devices || !invoicesWithDetails || !appSettings || !users) {
      return [];
    }

    const now = new Date();
    const billingCycleDays = appSettings.billingCycleDays || 30;
    const gracePeriodDays = appSettings.gracePeriodDays || 5;

    return devices.filter((device) => {
      const expiryDate = device.attributes.expiryDate ? parseISO(device.attributes.expiryDate) : null;
      if (!expiryDate || isAfter(now, expiryDate)) return false;

      const deviceInvoices = invoicesWithDetails.filter((inv) => inv.invoice.deviceIds.includes(device.id));
      if (deviceInvoices.length === 0) {
        return true;
      }

      const lastInvoice = deviceInvoices.sort((a, b) => 
        new Date(b.invoice.createdAt).getTime() - new Date(a.invoice.createdAt).getTime()
      )[0];

      const lastInvoiceDate = new Date(lastInvoice.invoice.createdAt);
      const nextInvoiceDate = new Date(lastInvoiceDate);
      nextInvoiceDate.setDate(nextInvoiceDate.getDate() + billingCycleDays);

      const dueThreshold = new Date(nextInvoiceDate);
      dueThreshold.setDate(dueThreshold.getDate() - gracePeriodDays);

      return isAfter(now, dueThreshold);
    }).map(device => {
      const user = users?.find(u => u.id === device.groupId);
      return {
        ...device,
        userName: user?.name || 'Unknown Customer'
      };
    });
  }, [devices, invoicesWithDetails, appSettings, users]);

  return {
    devicesDueForInvoice,
    isLoading,
    totalDevices: devices?.length || 0,
    invoicesGeneratedThisMonth: invoicesWithDetails?.filter(inv => {
      const invDate = new Date(inv.invoice.createdAt);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      return isAfter(invDate, startOfMonth);
    }).length || 0
  };
}
