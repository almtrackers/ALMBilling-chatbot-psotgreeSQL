'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { InventoryItem, Sale, StockAllocation, CompanyVehicle } from '@/lib/types';
import { useDevices } from './use-devices';

const fetcher = (url: string) => fetch(url).then(res => res.json());

/**
 * Calculates the available stock for a sale, either from the central inventory
 * or from a specific dealer's allocated stock.
 * @param dealerId - Optional ID of the dealer. If null/undefined, calculates for central stock.
 * @returns An object with the calculated `availableStock` and a `isLoading` flag.
 */
export function useAvailableStock(dealerId?: string | null) {
  const { devices: traccarDevices, isLoading: loadingTraccarDevices } = useDevices();

  const { data: allInventory, isLoading: loadingInventory } = useSWR<InventoryItem[]>('/api/inventory', fetcher);
  const { data: allSales, isLoading: loadingSales } = useSWR<Sale[]>('/api/sales', fetcher);
  const { data: allAllocations, isLoading: loadingAllocations } = useSWR<StockAllocation[]>('/api/stock-allocations', fetcher);
  const { data: allCompanyVehicles, isLoading: loadingCompanyVehicles } = useSWR<CompanyVehicle[]>('/api/company-vehicles', fetcher);

  const isLoading = loadingInventory || loadingSales || loadingAllocations || loadingTraccarDevices || loadingCompanyVehicles;

  const availableStock = useMemo(() => {
    if (isLoading || !allInventory || !allSales || !allAllocations || !traccarDevices || !allCompanyVehicles) {
      return [];
    }

    const soldImeis = new Set([
      ...allSales.map(s => s.imei),
      ...allCompanyVehicles.map(v => v.imei)
    ].filter(Boolean));
    
    const soldSimImsis = new Set([
      ...allSales.map(s => s.imsi),
      ...allCompanyVehicles.map(v => v.imsi)
    ].filter(Boolean));
    
    const serverImeis = new Set(traccarDevices.map(d => d.uniqueId));

    // For central stock (no dealer selected)
    if (!dealerId) {
      // Ensure allAllocations is always treated as an array
      const safeAllocations = Array.isArray(allAllocations) ? allAllocations : [];
      const allAllocatedImeis = new Set(safeAllocations.flatMap(a => (a.allocatedImeis as string[]) || []));
      const allAllocatedSimImsis = new Set(safeAllocations.flatMap(a => (a.allocatedSims as any[]) || []).map(s => s.imsi));
      
      const centralStock: InventoryItem[] = [];

      allInventory.forEach(item => {
        if (item.type === 'tracker') {
          const availableImeis = (item.imeis as string[])?.filter(imei => 
              !allAllocatedImeis.has(imei) && 
              !soldImeis.has(imei) &&
              !serverImeis.has(imei)
          ) || [];
          if (availableImeis.length > 0) {
            centralStock.push({ ...item, imeis: availableImeis, quantity: availableImeis.length });
          }
        } else if (item.type === 'sim') {
          const availableSims = (item.sims as any[])?.filter(sim => !allAllocatedSimImsis.has(sim.imsi) && !soldSimImsis.has(sim.imsi)) || [];
           if (availableSims.length > 0) {
            centralStock.push({ ...item, sims: availableSims, quantity: availableSims.length });
          }
        } else {
          // For other bulk items
          const totalAllocated = allAllocations
            .filter(a => a.inventoryItemId === item.id)
            .reduce((sum, a) => sum + a.quantity, 0);
          
          const totalSold = [...allSales, ...allCompanyVehicles].filter(s => 
              s.harnessId === item.id || 
              s.relayId === item.id || 
              s.micId === item.id || 
              s.sosButtonId === item.id
          ).length;

          const availableQty = item.quantity - totalAllocated - totalSold;
          if (availableQty > 0) {
            centralStock.push({ ...item, quantity: availableQty });
          }
        }
      });
      return centralStock;
    }

    // For a specific dealer's stock
    const dealerAllocations = allAllocations.filter(a => a.dealerId === dealerId);
    const dealerStock: InventoryItem[] = [];

    const itemMap = new Map<string, InventoryItem>();
    
    // Aggregate all allocations for the dealer
    dealerAllocations.forEach(alloc => {
      const baseItem = allInventory.find(i => i.id === alloc.inventoryItemId);
      if (!baseItem) return;

      if (!itemMap.has(baseItem.id)) {
        itemMap.set(baseItem.id, {
          ...baseItem,
          quantity: 0,
          imeis: [],
          sims: []
        });
      }
      const dealerItem = itemMap.get(baseItem.id)!;

      if (baseItem.type === 'tracker' && alloc.allocatedImeis) {
        dealerItem.imeis = [...((dealerItem.imeis as string[]) || []), ...(alloc.allocatedImeis as string[])];
      } else if (baseItem.type === 'sim' && alloc.allocatedSims) {
        dealerItem.sims = [...((dealerItem.sims as any[]) || []), ...(alloc.allocatedSims as any[])];
      } else {
        dealerItem.quantity += alloc.quantity;
      }
    });

    // Filter out sold items
    itemMap.forEach(item => {
      if (item.type === 'tracker') {
        item.imeis = (item.imeis as string[])?.filter(imei => !soldImeis.has(imei) && !serverImeis.has(imei));
        item.quantity = (item.imeis as string[])?.length || 0;
      } else if (item.type === 'sim') {
        item.sims = (item.sims as any[])?.filter(sim => !soldSimImsis.has(sim.imsi));
        item.quantity = (item.sims as any[])?.length || 0;
      } else {
        const soldFromDealer = [...allSales, ...allCompanyVehicles].filter(s => s.dealerId === dealerId && (
            s.harnessId === item.id ||
            s.relayId === item.id ||
            s.micId === item.id ||
            s.sosButtonId === item.id
        )).length;
        item.quantity -= soldFromDealer;
      }
      
      if(item.quantity > 0) {
          dealerStock.push(item);
      }
    });

    return dealerStock;

  }, [isLoading, allInventory, allSales, allAllocations, allCompanyVehicles, traccarDevices, dealerId]);

  return { availableStock, isLoading };
}
