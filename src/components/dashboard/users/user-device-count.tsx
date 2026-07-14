
'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/api';
import type { Device } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format, parseISO, differenceInDays } from 'date-fns';

const fetcher = (url: string) => apiClient.get(url).then((res) => res.data);

type UserDeviceCountProps = {
  userId: number;
};

const getExpiryInfo = (expirationTime?: string) => {
  if (!expirationTime) {
    return {
      text: 'No Expiry',
      badge: <Badge variant="secondary">N/A</Badge>,
    };
  }
  const expiryDate = parseISO(expirationTime);
  const daysLeft = differenceInDays(expiryDate, new Date());

  let badge;
  if (daysLeft < 0) {
    badge = (
      <Badge variant="destructive">
        {daysLeft} days
      </Badge>
    );
  } else if (daysLeft <= 30) {
    badge = (
      <Badge className="bg-yellow-500 hover:bg-yellow-600">
        {daysLeft} days
      </Badge>
    );
  } else {
    badge = (
      <Badge className="bg-green-500 hover:bg-green-600">{daysLeft} days</Badge>
    );
  }

  return {
    text: format(expiryDate, 'PP'),
    badge,
  };
};

export default function UserDeviceCount({ userId }: UserDeviceCountProps) {
  const { data, error, isLoading } = useSWR<Device[]>(
    `/devices?userId=${userId}`,
    fetcher
  );

  if (isLoading) {
    return <Skeleton className="h-5 w-8" />;
  }

  if (error) {
    return <span className="text-destructive text-xs">Error</span>;
  }

  const devices = Array.isArray(data) ? data : [];
  const count = devices.length;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={count > 0 ? 'default' : 'secondary'}>{count}</Badge>
        </TooltipTrigger>
        <TooltipContent className="p-4">
          {count > 0 ? (
            <div className="space-y-2">
              <h4 className="font-semibold">Assigned Devices</h4>
              <ul className="list-none space-y-1.5">
                {devices.map((device) => {
                  const expiryInfo = getExpiryInfo(device.expirationTime);
                  return (
                    <li key={device.id} className="flex items-center justify-between gap-4 text-sm">
                      <span>
                        {device.name} ({device.id})
                      </span>
                      {expiryInfo.badge}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p>No devices assigned to this user.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
