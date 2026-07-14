import useSWR from 'swr';
import type { DeviceRemark } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useDeviceRemarks(deviceId?: number) {
  const url = deviceId ? `/api/traccar/devices/remarks?deviceId=${deviceId}` : '/api/traccar/devices/remarks';
  const { data, error, isLoading, mutate } = useSWR<DeviceRemark[]>(url, fetcher);

  return {
    remarks: data,
    isLoading,
    isError: error,
    mutate,
  };
}
