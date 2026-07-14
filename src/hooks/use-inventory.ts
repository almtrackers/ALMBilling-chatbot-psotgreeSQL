'use client';

import useSWR from 'swr';
import type { InventoryItem } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useInventory() {
  const { data, error, isLoading, mutate } = useSWR<InventoryItem[]>('/api/inventory', fetcher);

  return {
    inventoryItems: data,
    isLoading,
    isError: error,
    mutate,
  };
}
