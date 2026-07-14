import useSWR from 'swr';
import type { Person } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function usePersons() {
  const { data, error, isLoading, mutate } = useSWR<Person[]>('/api/people', fetcher);

  return {
    persons: data,
    isLoading,
    isError: error,
    mutate,
  };
}
