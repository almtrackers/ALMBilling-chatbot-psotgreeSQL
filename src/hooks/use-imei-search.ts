
'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import type { Sale, CompanyVehicle, InventoryItem } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then(res => res.json());

type SearchResult = {
  status: 'found' | 'not_found' | 'idle';
  location: 'in_stock' | 'sold' | 'company_vehicle' | null;
  title: string;
  description: string;
};

export function useImeiSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  const { data: allInventory, isLoading: loadingInventory } = useSWR<InventoryItem[]>('/api/inventory', fetcher);
  const { data: allSales, isLoading: loadingSales } = useSWR<Sale[]>('/api/sales', fetcher);
  const { data: allCompanyVehicles, isLoading: loadingCompanyVehicles } = useSWR<CompanyVehicle[]>('/api/company-vehicles', fetcher);

  const searchImei = useCallback((rawTerm: string) => {
    const term = rawTerm.trim();

    if (!term) {
      setResult(null);
      return;
    }
    
    setIsLoading(true);

    if (loadingInventory || loadingSales || loadingCompanyVehicles) {
      // Data is still loading, we can't search yet.
      // This case should be handled by disabling the search button.
      // But as a safeguard:
      setTimeout(() => searchImei(term), 100);
      return;
    }
    
    const isLast4Numeric = /^\d{4}$/.test(term);

    // 1. Check in Sales (IMEI, then SIM by IMSI/number)
    const saleByImei = allSales?.find((s) => s.imei === term);
    if (saleByImei) {
      setResult({
        status: 'found',
        location: 'sold',
        title: 'IMEI Already Sold',
        description: `This IMEI is registered to vehicle "${saleByImei.vehicleNumber}" under customer "${saleByImei.customerName}".`,
      });
      setIsLoading(false);
      return;
    }

    const saleBySim = allSales?.find((s) => {
      if (!s.imsi && !s.simNumber) return false;
      if (isLast4Numeric) {
        return (
          (s.imsi && s.imsi.endsWith(term)) ||
          (s.simNumber && s.simNumber.endsWith(term))
        );
      }
      const t = term.toLowerCase();
      return (
        (s.imsi && s.imsi.toLowerCase().includes(t)) ||
        (s.simNumber && s.simNumber.toLowerCase().includes(t))
      );
    });

    if (saleBySim) {
      setResult({
        status: 'found',
        location: 'sold',
        title: 'SIM Already Sold',
        description: `This SIM (${saleBySim.simNumber} / ${saleBySim.imsi}) is registered to vehicle "${saleBySim.vehicleNumber}" under customer "${saleBySim.customerName}".`,
      });
      setIsLoading(false);
      return;
    }

    // 2. Check in Company Vehicles
    const companyVehicleRecord = allCompanyVehicles?.find((v) => {
      if (v.imei === term) return true;
      if (!v.imsi && !v.simNumber) return false;
      if (isLast4Numeric) {
        return (
          (v.imsi && v.imsi.endsWith(term)) ||
          (v.simNumber && v.simNumber.endsWith(term))
        );
      }
      const t = term.toLowerCase();
      return (
        (v.imsi && v.imsi.toLowerCase().includes(t)) ||
        (v.simNumber && v.simNumber.toLowerCase().includes(t))
      );
    });

    if (companyVehicleRecord) {
      const isTrackerMatch = companyVehicleRecord.imei === term;
      setResult({
        status: 'found',
        location: 'company_vehicle',
        title: isTrackerMatch ? 'IMEI in Use by Company' : 'SIM in Use by Company',
        description: isTrackerMatch
          ? `This IMEI is assigned to company vehicle "${companyVehicleRecord.vehicleNumber}" (Driver/Dept: ${companyVehicleRecord.customerName}).`
          : `This SIM (${companyVehicleRecord.simNumber} / ${companyVehicleRecord.imsi}) is assigned to company vehicle "${companyVehicleRecord.vehicleNumber}" (Driver/Dept: ${companyVehicleRecord.customerName}).`,
      });
      setIsLoading(false);
      return;
    }
    
    // 3. Check in Inventory (tracker IMEI or SIM IMSI/number)
    const trackerItem = allInventory?.find(
      (item) => item.type === 'tracker' && item.imeis?.includes(term)
    );
    if (trackerItem) {
      setResult({
        status: 'found',
        location: 'in_stock',
        title: 'IMEI Found in Stock',
        description: `This IMEI is part of the "${trackerItem.name}" stock. It is available to be sold.`,
      });
      setIsLoading(false);
      return;
    }

    const simItem = allInventory?.find((item) => {
      if (item.type !== 'sim' || !item.sims) return false;
      return item.sims.some((sim) => {
        if (isLast4Numeric) {
          return (
            sim.imsi.endsWith(term) ||
            sim.simNumber.endsWith(term)
          );
        }
        const t = term.toLowerCase();
        return (
          sim.imsi.toLowerCase().includes(t) ||
          sim.simNumber.toLowerCase().includes(t)
        );
      });
    });

    if (simItem) {
      setResult({
        status: 'found',
        location: 'in_stock',
        title: 'SIM Found in Stock',
        description: `A SIM matching "${term}" is part of the "${simItem.name}" stock and is available to be sold.`,
      });
      setIsLoading(false);
      return;
    }

    // 4. Not found anywhere
    setResult({
      status: 'not_found',
      location: null,
      title: 'Not Found',
      description:
        'This IMEI / IMSI / SIM number does not exist in your sales records, company vehicles, or available inventory.',
    });
    setIsLoading(false);

  }, [allInventory, allSales, allCompanyVehicles, loadingInventory, loadingSales, loadingCompanyVehicles]);

  return { result, isLoading, searchImei };
}
