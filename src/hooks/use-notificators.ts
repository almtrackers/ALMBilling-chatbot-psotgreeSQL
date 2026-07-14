
'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/api';
import type { Notificator } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';

const fetcher = (url: string) => apiClient.get<Notificator[]>(url).then((res) => res.data);

export function useNotificators() {
  const { isAuthenticated } = useAuth();
  const { data, error, isLoading, mutate } = useSWR<Notificator[]>(
    isAuthenticated ? '/notifications/notificators' : null,
    fetcher
  );

  return {
    notificators: data,
    isLoading,
    isError: !!error,
    mutate,
  };
}
