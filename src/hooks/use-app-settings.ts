
import useSWR from 'swr';
import type { AppSettings } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useAppSettings() {
  const { data, error, isLoading, mutate } = useSWR<AppSettings>(
    '/api/app-settings',
    fetcher
  );

  return {
    appSettings: data,
    isLoading,
    isError: error,
    mutate,
  };
}
