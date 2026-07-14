
'use client';

import { useState, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import MonitorDevicesList from '@/components/dashboard/monitor-devices/monitor-devices-list';

export default function MonitorDevicesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitor Devices"
        description="Track offline, unknown, and expired devices. Export SIM numbers with coordinates for field teams."
      />
      <MonitorDevicesList />
    </div>
  );
}
