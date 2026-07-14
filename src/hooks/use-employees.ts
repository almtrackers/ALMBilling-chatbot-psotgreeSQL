import useSWR from 'swr';
import type { Employee } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useEmployees() {
  const { data, error, isLoading, mutate } = useSWR<Employee[]>('/api/employees', fetcher);

  return {
    employees: data,
    isLoading,
    isError: error,
    mutate,
  };
}
