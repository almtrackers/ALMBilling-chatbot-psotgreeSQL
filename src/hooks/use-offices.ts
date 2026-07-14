import useSWR from 'swr';
import type { Office } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useOffices() {
  const { data, error, isLoading, mutate } = useSWR<Office[]>('/api/offices', fetcher);

  return {
    offices: data,
    isLoading,
    isError: error,
    mutate,
  };
}
