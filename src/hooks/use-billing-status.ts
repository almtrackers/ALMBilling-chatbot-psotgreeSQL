'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useDevices } from './use-devices';
import type { Sale, CompanyVehicle, Device, InventoryItem } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export type UnbilledDevice = Device & {
  isInStock: boolean;
  trackerId: string | null;
};

export function useBillingStatus() {
  const { devices, isLoading: isLoadingDevices, isError: isErrorDevices, mutate: mutateDevices } = useDevices();

  const { data: sales, isLoading: isLoadingSales, error: errorSales } = useSWR<Sale[]>('/api/sales', fetcher);
  const { data: companyVehicles, isLoading: isLoadingCompanyVehicles, error: errorCompanyVehicles } = useSWR<CompanyVehicle[]>('/api/company-vehicles', fetcher);
  const { data: inventory, isLoading: isLoadingInventory, error: errorInventory } = useSWR<InventoryItem[]>('/api/inventory', fetcher);

  const unbilledDevices: UnbilledDevice[] = useMemo(() => {
    if (!devices || !sales || !companyVehicles || !inventory) {
      return [];
    }

    const soldImeis = new Set([
        ...sales.map(sale => sale.imei),
        ...companyVehicles.map(vehicle => vehicle.imei)
    ].filter(Boolean));
    
    // Create a map of IMEI -> inventory item ID
    const imeiToTrackerIdMap = new Map<string, string>();
    inventory
      .filter(item => item.type === 'tracker' && item.imeis)
      .forEach(item => {
        item.imeis!.forEach(imei => {
          imeiToTrackerIdMap.set(imei, item.id);
        });
      });

    return devices
      .filter(device => !soldImeis.has(device.uniqueId))
      .map(device => {
        const trackerId = imeiToTrackerIdMap.get(device.uniqueId) || null;
        return {
          ...device,
          isInStock: !!trackerId,
          trackerId: trackerId,
        };
      });

  }, [devices, sales, companyVehicles, inventory]);

  const isLoading = isLoadingDevices || isLoadingSales || isLoadingInventory || isLoadingCompanyVehicles;
  const error = isErrorDevices || errorSales || errorInventory || errorCompanyVehicles;

  const mutate = () => {
    mutateDevices();
  }

  return { unbilledDevices, isLoading, error, mutate };
}
