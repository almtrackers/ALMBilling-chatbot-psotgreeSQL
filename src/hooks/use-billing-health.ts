'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useInvoices } from './use-invoices';
import { useDevices } from './use-devices';
import { useTraccarUsers } from './use-traccar-users';
import type { Invoice, Device, TraccarUser, AppSettings } from '@/lib/types';
import { parseISO, addMonths, addYears, isPast, subDays, addDays } from 'date-fns';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export type BillingPeriodDetail = {
  index: number;
  start: Date;
  end: Date;
  amount: number;
  breakdown: {
    renewalFee: number;
    simCharges: number;
    otherCharges: number;
    discount: number;
  };
};

export type BillingHistoryRow = {
  deviceId: number;
  deviceName: string;
  customerName: string;
  username: string;
  customerContact: string;
  userId: number | null;
  installationDate: Date | null;
  renewalFee: number;
  periodType: 'monthly' | 'yearly';
  expectedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  warnings: string[];
  periods: BillingPeriodDetail[];
};

export function useBillingHealth() {
  const { invoicesWithDetails, isLoading: isLoadingInvoices } = useInvoices();
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const { users, isLoading: isLoadingUsers } = useTraccarUsers();
  
  const { data: appSettings, isLoading: isLoadingSettings } = useSWR<AppSettings>('/api/app-settings', fetcher);

  const rows: BillingHistoryRow[] | null = useMemo(() => {
    if (!invoicesWithDetails || !devices || !users || !appSettings) return null;

    const now = new Date();
    const threshold = appSettings.monthlyYearlyThreshold || 2000;
    const userMap = new Map<number, TraccarUser>(
      users.map(u => [u.id, u as TraccarUser])
    );

    // Build a map of deviceId -> invoices (for paid amounts)
    const deviceInvoicesMap = new Map<number, Invoice[]>();
    invoicesWithDetails.forEach(({ invoice }) => {
      // Ensure deviceIds is always an array
      let deviceIds: number[] = [];
      if (Array.isArray(invoice.deviceIds)) {
        deviceIds = invoice.deviceIds;
      } else if (typeof invoice.deviceIds === 'string') {
        // Handle case where deviceIds might be a JSON string
        try {
          deviceIds = JSON.parse(invoice.deviceIds);
        } catch {
          deviceIds = [];
        }
      } else if ((invoice as any).deviceId) {
        // Fallback to single deviceId
        deviceIds = [(invoice as any).deviceId];
      }
      
      // Ensure we have an array of numbers
      deviceIds = deviceIds.filter(id => typeof id === 'number');
      
      deviceIds.forEach((deviceId: number) => {
        if (!deviceInvoicesMap.has(deviceId)) {
          deviceInvoicesMap.set(deviceId, []);
        }
        deviceInvoicesMap.get(deviceId)!.push(invoice);
      });
    });

    const result: BillingHistoryRow[] = [];

    for (const device of devices) {
      const renewalFee = Number(device.attributes?.renewalFee) || 0;
      // Check for installationDate in various case formats
      const installationDateValue =
        device.attributes?.installationDate ||
        device.attributes?.InstallationDate ||
        device.attributes?.intallationDate ||
        device.attributes?.instaltionDate ||
        device.attributes?.installation_date ||
        device.attributes?.Installation_Date ||
        device.attributes?.installDate ||
        device.attributes?.InstallDate ||
        device.attributes?.["Installation Date"];

      let installationDate: Date | null = null;
      const warnings: string[] = [];

      if (!device.attributes?.uId) warnings.push('Missing uId');
      if (!renewalFee) warnings.push('Missing renewalFee');
      if (installationDateValue) {
        try {
          // Handle different date formats
          let parsed: Date;
          
          if (typeof installationDateValue === 'string') {
            // Try ISO format first (handles formats like "2026-02-11T13:10:50.363Z")
            parsed = parseISO(installationDateValue);
            // If parseISO fails (returns invalid date), try new Date() as fallback
            if (isNaN(parsed.getTime())) {
              parsed = new Date(installationDateValue);
            }
          } else if (typeof installationDateValue === 'number') {
            // Handle timestamp (seconds or milliseconds)
            parsed = new Date(installationDateValue > 1000000000000 ? installationDateValue : installationDateValue * 1000);
          } else if (installationDateValue instanceof Date) {
            parsed = installationDateValue;
          } else {
            // Try to convert to string and parse
            parsed = new Date(String(installationDateValue));
          }

          if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
            // Valid date (reasonable year check)
            installationDate = parsed;
          } else {
            console.warn(`⚠️ Device ${device.id} (${device.name}): Invalid installationDate format:`, installationDateValue, 'Parsed as:', parsed);
            warnings.push('Invalid installationDate');
          }
        } catch (error) {
          console.warn(`⚠️ Device ${device.id} (${device.name}): Failed to parse installationDate:`, installationDateValue, error);
          warnings.push('Invalid installationDate');
        }
      } else {
        // Log devices missing installationDate for debugging (only if we have attributes)
        if (device.attributes) {
          const attrKeys = Object.keys(device.attributes);
          const hasInstallKey = attrKeys.some(k => k.toLowerCase().includes('install'));
          if (hasInstallKey) {
            const installKeys = attrKeys.filter(k => k.toLowerCase().includes('install'));
            console.warn(`⚠️ Device ${device.id} (${device.name}): Found install-related keys but couldn't parse date. Keys:`, installKeys, 'Values:', installKeys.map(k => device.attributes![k]));
          }
        }
        warnings.push('Missing installationDate');
      }

      // Determine period type (default to monthly if no renewalFee)
      const periodType: 'monthly' | 'yearly' = renewalFee > 0 && renewalFee <= threshold ? 'monthly' : renewalFee > threshold ? 'yearly' : 'monthly';

      // Calculate expected billing periods from installation (ignoring first period)
      let expectedAmount = 0;
      const periods: BillingPeriodDetail[] = [];

      if (installationDate && renewalFee > 0) {
        let periodIndex = 0;
        let periodStart = installationDate;

        // Use renewal date/expiration time as the current billing end date
        const currentBillingDateValue = 
          device.attributes?.expiryDate ||
          device.attributes?.renewalDate ||
          device.attributes?.renewal_date ||
          device.attributes?.renewlDate ||
          device.expirationTime;
        
        let billingEndDate = now;
        if (currentBillingDateValue) {
          const parsedEnd = typeof currentBillingDateValue === 'string' ? parseISO(currentBillingDateValue) : new Date(currentBillingDateValue);
          if (!isNaN(parsedEnd.getTime())) {
            billingEndDate = parsedEnd;
          }
        }

        // Advance to the current/next future expiration date
        while (isPast(billingEndDate)) {
          billingEndDate = periodType === 'yearly' ? addYears(billingEndDate, 1) : addMonths(billingEndDate, 1);
        }

        // Allow 7-day pre-expiry lookahead so users are billed before service expires
        const lookaheadDate = addDays(now, 7);
        const effectiveEndDate = billingEndDate < lookaheadDate ? billingEndDate : lookaheadDate;

        while (periodStart < effectiveEndDate) {
          const periodEnd =
            periodType === 'yearly'
              ? addYears(periodStart, 1)
              : addMonths(periodStart, 1);

          if (periodIndex > 0) {
            // Skip first period (sale period), bill all subsequent periods
            const simCharges = Number(device.attributes?.simCharges) || 0;
            const otherCharges = Number(device.attributes?.otherCharges) || 0;
            const discount = Number(device.attributes?.discount) || 0;
            const periodAmount = renewalFee + simCharges + otherCharges - discount;

            expectedAmount += periodAmount;
            
            periods.push({
              index: periodIndex,
              start: periodStart,
              end: periodEnd,
              amount: periodAmount,
              breakdown: {
                renewalFee,
                simCharges,
                otherCharges,
                discount
              }
            });
          }

          periodIndex++;
          periodStart = periodEnd;
        }
      }

      // Calculate paid amount from invoices for this device
      const deviceInvoices = deviceInvoicesMap.get(device.id) || [];
      let paidAmount = 0;
      deviceInvoices.forEach(inv => {
        if (inv.status === 'paid') {
          // Distribute paid amount proportionally if invoice has multiple devices
          const deviceCount = inv.deviceIds?.length || 1;
          paidAmount += (inv.totalAmount || 0) / deviceCount;
        }
      });

      // Get customer info
      const ownerId = device.attributes?.uId || device.attributes?.userId;
      const userId = ownerId ? Number(ownerId) : null;
      const owner = ownerId ? userMap.get(Number(ownerId)) : undefined;
      const customerName = owner?.name || 'Unknown User';
      const username = owner?.email || 'N/A';
      const customerContact = owner?.email || owner?.phone || 'N/A';

      result.push({
        deviceId: device.id,
        deviceName: device.name,
        customerName,
        username,
        customerContact,
        userId,
        installationDate,
        renewalFee,
        periodType,
        expectedAmount,
        paidAmount,
        remainingAmount: expectedAmount - paidAmount,
        warnings,
        periods,
      });
    }

    return result.sort((a, b) => {
      const aHasData = Boolean(a.installationDate && a.renewalFee > 0);
      const bHasData = Boolean(b.installationDate && b.renewalFee > 0);
      if (aHasData !== bHasData) return aHasData ? -1 : 1;
      return b.remainingAmount - a.remainingAmount;
    });
  }, [invoicesWithDetails, devices, users, appSettings]);

  const isLoading = isLoadingInvoices || isLoadingDevices || isLoadingUsers || isLoadingSettings;

  return { 
    rows: rows || [], 
    billingHistory: rows || [], 
    isLoading 
  };
}
