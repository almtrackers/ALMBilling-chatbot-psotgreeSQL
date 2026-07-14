'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';

const fetcher = (url: string) => apiClient.get<Notification[]>(url).then((res) => res.data);

export function useNotifications() {
  const { isAuthenticated } = useAuth();
  const { data, error, isLoading, mutate } = useSWR<Notification[]>(
    isAuthenticated ? '/notifications' : null,
    fetcher
  );

  return {
    notifications: data,
    isLoading,
    isError: !!error,
    mutate,
  };
}
