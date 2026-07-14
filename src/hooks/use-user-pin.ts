
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useUserPin(traccarId?: number | null) {
  const { data, error, isLoading, mutate } = useSWR(
    traccarId ? `/api/auth/pin?traccarId=${traccarId}` : null,
    fetcher
  );

  return {
    pinStatus: data,
    isLoading,
    isError: error,
    mutate,
  };
}
