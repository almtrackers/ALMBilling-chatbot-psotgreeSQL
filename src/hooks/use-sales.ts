import useSWR from 'swr';
import type { Sale } from '@/lib/types';
import { fetcher } from '@/lib/fetcher';

export function useSales() {
  const { data, error, isLoading, mutate } = useSWR<Sale[]>('/api/sales', fetcher);

  return {
    sales: data,
    isLoading,
    isError: error,
    mutate,
  };
}
