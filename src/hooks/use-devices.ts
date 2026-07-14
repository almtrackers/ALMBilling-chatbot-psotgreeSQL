
'use client';

import { useWebSocket } from '@/contexts/websocket-context';
import { useMemo } from 'react';

export function useDevices() {
  const { devices: devicesMap, isLoading, isConnected } = useWebSocket();

  const devices = useMemo(() => Object.values(devicesMap), [devicesMap]);

  // The 'mutate' function is kept for API compatibility with existing components,
  // but it's a no-op as the WebSocket now handles updates automatically.
  const mutate = () => {
    // Data is pushed from the server, no need to manually re-fetch.
  };

  return {
    devices: devices,
    isLoading: isLoading && devices.length === 0,
    isError: !isConnected && !isLoading,
    mutate,
  };
}
