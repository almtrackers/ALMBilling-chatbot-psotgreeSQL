import useSWR from 'swr';
import type { Dealer } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useDealers() {
  const { data, error, isLoading, mutate } = useSWR<Dealer[]>('/api/dealers', fetcher);

  return {
    dealers: data,
    isLoading,
    isError: error,
    mutate,
  };
}
