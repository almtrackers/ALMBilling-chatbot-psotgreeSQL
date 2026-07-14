import useSWR from 'swr';
import type { CustomCommand } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useCommands() {
  const { data, error, isLoading, mutate } = useSWR<CustomCommand[]>('/api/commands', fetcher);

  return {
    commands: data,
    isLoading,
    isError: error,
    mutate,
  };
}
