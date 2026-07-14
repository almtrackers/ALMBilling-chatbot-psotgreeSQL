'use client';

import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useDevices } from '@/hooks/use-devices';
import { AlertCircle, ServerCrash, X } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';

export default function OfflineDeviceWarnings() {
  const { devices, isLoading, isError } = useDevices();
  const [isDismissed, setIsDismissed] = useState(false);

  const offlineDevices = useMemo(() => {
    if (!devices) return [];
    return devices
        .filter(device => device.status === 'offline' && device.lastUpdate)
        .sort((a,b) => parseISO(b.lastUpdate).getTime() - parseISO(a.lastUpdate).getTime());
  }, [devices]);

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <ServerCrash className="h-4 w-4" />
        <AlertTitle>Could Not Check Device Status</AlertTitle>
        <AlertDescription>
          There was an error fetching device statuses from the server.
        </AlertDescription>
      </Alert>
    );
  }

  if (isDismissed || !offlineDevices || offlineDevices.length === 0) {
    return null; // Don't render anything if there are no warnings or if dismissed
  }

  return (
    <Alert variant="destructive">
      <div className="flex justify-between items-start">
        <div className="flex-grow">
            <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                    {offlineDevices.length} Device(s) Offline
                </AlertTitle>
            </div>
            <AlertDescription>
            The following devices are not currently reporting to the server.
            <ul className="mt-2 list-none space-y-1 text-xs max-h-48 overflow-y-auto">

                {offlineDevices.map((device) => (
                <li key={device.id} className="flex justify-between items-center">
                    <span>
                    <strong>{device.name}</strong> (IMEI: {device.uniqueId})
                    </span>
                    <span className="text-red-300">
                    Offline for {formatDistanceToNow(parseISO(device.lastUpdate), { addSuffix: true })}
                    </span>
                </li>
                ))}
            </ul>
            </AlertDescription>
        </div>
         <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsDismissed(true)}>
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </Alert>
  );
}
