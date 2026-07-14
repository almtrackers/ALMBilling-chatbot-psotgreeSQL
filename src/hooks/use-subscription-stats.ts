
'use client';

import { useMemo } from 'react';
import { useDevices } from './use-devices';
import { parseISO, isBefore, endOfYear, endOfMonth } from 'date-fns';
import useSWR from 'swr';
import type { AppSettings } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useSubscriptionStats() {
  const { devices, isLoading, isError } = useDevices();
  const { data: appSettings, isLoading: isLoadingSettings } = useSWR<AppSettings>('/api/app-settings', fetcher);

  const stats = useMemo(() => {
    let expectedYearlyRevenue = 0;
    let yearlyCount = 0;
    let expectedMonthlyRevenue = 0;
    let monthlyCount = 0;
    
    const today = new Date();
    const endOfCurrentYear = endOfYear(today);
    const endOfCurrentMonth = endOfMonth(today);

    if (devices && appSettings) {
      const threshold = appSettings.monthlyYearlyThreshold || 2000;
      for (const device of devices) {
        const renewalFee = Number(device.attributes?.renewalFee) || 0;
        const billingExpiry = device.attributes?.expiryDate || device.expirationTime;
        if (!billingExpiry || renewalFee === 0) {
          continue;
        }

        const expiryDate = parseISO(billingExpiry);
        const durationType = renewalFee > threshold ? 'yearly' : 'monthly';
        
        // Skip if expiry date has already passed
        if (isBefore(expiryDate, today)) {
          continue;
        }

        // Calculate expected yearly revenue
        if (durationType === 'yearly' && isBefore(expiryDate, endOfCurrentYear)) {
          expectedYearlyRevenue += renewalFee;
          yearlyCount++;
        }

        // Calculate expected monthly revenue
        if (
          durationType === 'monthly' &&
          isBefore(expiryDate, endOfCurrentMonth)
        ) {
          expectedMonthlyRevenue += renewalFee;
          monthlyCount++;
        }
      }
    }

    return {
      expectedYearlyRevenue,
      yearlyCount,
      expectedMonthlyRevenue,
      monthlyCount,
    };
  }, [devices, appSettings]);

  return { stats, isLoading: isLoading || isLoadingSettings, isError };
}
