import useSWR from 'swr';
import type { Expense } from '@/lib/types';
import { fetcher } from '@/lib/fetcher';

export function useExpenses() {
  const { data, error, isLoading, mutate } = useSWR<Expense[]>('/api/expenses', fetcher);

  return {
    expenses: data,
    isLoading,
    isError: error,
    mutate,
  };
}
