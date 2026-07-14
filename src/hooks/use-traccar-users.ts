'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/api';
import type { TraccarUser } from '@/lib/types';
import { useAuth as useTraccarAuth } from '@/contexts/auth-context';

const fetcher = (url: string) => apiClient.get<TraccarUser[]>(url).then((res) => res.data);

export function useTraccarUsers() {
  const { isAuthenticated } = useTraccarAuth();
  const { data, error, isLoading, mutate } = useSWR<TraccarUser[]>(
    isAuthenticated ? '/users' : null,
    fetcher
  );

  return {
    users: data,
    isLoading,
    isError: !!error,
    mutate,
  };
}
