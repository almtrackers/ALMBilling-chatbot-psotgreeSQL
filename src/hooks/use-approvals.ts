import useSWR from 'swr';
import type { ApprovalRequest } from '@/lib/types';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

export function useApprovals() {
  const { data, error, isLoading, mutate } = useSWR<ApprovalRequest[]>('/api/approvals', fetcher);

  return {
    approvals: Array.isArray(data) ? data : undefined,
    isLoading,
    isError: error,
    mutate,
  };
}
