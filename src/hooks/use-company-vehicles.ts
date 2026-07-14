import useSWR from 'swr';
import type { CompanyVehicle } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useCompanyVehicles() {
  const { data, error, isLoading, mutate } = useSWR<CompanyVehicle[]>('/api/company-vehicles', fetcher);

  return {
    companyVehicles: data,
    isLoading,
    isError: error,
    mutate,
  };
}
