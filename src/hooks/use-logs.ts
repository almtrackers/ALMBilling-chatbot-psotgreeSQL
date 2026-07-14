import useSWR from 'swr';
import type { Log } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useLogs(limit: number = 100) {
  const { data, error, isLoading, mutate } = useSWR<Log[]>(`/api/logs?limit=${limit}`, fetcher);

  return {
    logs: data,
    isLoading,
    isError: error,
    mutate,
  };
}
