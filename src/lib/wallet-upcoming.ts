import { isSameDay } from 'date-fns';

type DeviceLike = {
  status: string;
  planPrice: number | { toNumber: () => number };
  nextBillingDate: string | Date;
};

export type UpcomingCharges = {
  /** Date of the very next billing across all active devices, or null. */
  nextBillingDate: Date | null;
  /** Sum of plan prices landing on that next billing date. */
  upcomingCharges: number;
  /** Number of devices billed on that date. */
  deviceCount: number;
};

function toNumber(value: number | { toNumber: () => number }): number {
  return typeof value === 'number' ? value : value.toNumber();
}

/**
 * Total charges landing on the very next billing date across a wallet's devices.
 * Devices billed on the same calendar day are grouped together.
 */
export function computeUpcomingCharges(devices: DeviceLike[]): UpcomingCharges {
  const active = devices
    .filter((d) => d.status !== 'blocked')
    .map((d) => ({ ...d, next: new Date(d.nextBillingDate) }))
    .filter((d) => !isNaN(d.next.getTime()));

  if (active.length === 0) {
    return { nextBillingDate: null, upcomingCharges: 0, deviceCount: 0 };
  }

  const nextDate = active.reduce(
    (min, d) => (d.next < min ? d.next : min),
    active[0].next
  );

  const sameDayDevices = active.filter((d) => isSameDay(d.next, nextDate));
  const total = sameDayDevices.reduce((sum, d) => sum + toNumber(d.planPrice), 0);

  return {
    nextBillingDate: nextDate,
    upcomingCharges: Math.round(total * 100) / 100,
    deviceCount: sameDayDevices.length,
  };
}
