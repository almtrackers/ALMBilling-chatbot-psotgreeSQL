import useSWR from 'swr';
import type { Log } from '@/lib/types';

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load logs (${response.status})`);
  return response.json();
};

export function useLogs(limit: number = 100) {
  const { data, error, isLoading, mutate } = useSWR<Log[]>(`/api/logs?limit=${limit}`, fetcher);

  return {
    logs: Array.isArray(data) ? data : undefined,
    isLoading,
    isError: error,
    mutate,
  };
}
