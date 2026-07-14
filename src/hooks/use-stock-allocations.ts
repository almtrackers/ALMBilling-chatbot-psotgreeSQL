import useSWR from 'swr';
import type { StockAllocation } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useStockAllocations() {
  const { data, error, isLoading, mutate } = useSWR<StockAllocation[]>('/api/stock-allocations', fetcher);

  return {
    stockAllocations: data,
    isLoading,
    isError: error,
    mutate,
  };
}
