import useSWR from 'swr';
import type { ApprovalRequest } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useApprovals() {
  const { data, error, isLoading, mutate } = useSWR<ApprovalRequest[]>('/api/approvals', fetcher);

  return {
    approvals: data,
    isLoading,
    isError: error,
    mutate,
  };
}
