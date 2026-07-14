'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import DeviceList from '@/components/dashboard/device-list';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UserPlus, Search, X } from 'lucide-react';
import OfflineDeviceWarnings from '@/components/dashboard/devices/offline-device-warnings';
import AssignOwnerDialog from '@/components/dashboard/devices/assign-owner-dialog';
import { Combobox } from '@/components/ui/combobox';

export default function DevicesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>(['all']);
  const [isAssignOwnerOpen, setIsAssignOwnerOpen] = useState(false);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter(['all']);
  };

  const hasActiveFilters = !!searchTerm || (statusFilter.length > 0 && !statusFilter.includes('all'));

  return (
    <>
      <PageHeader
        title="Devices"
        description="Manage all your tracked devices and their subscriptions."
      >
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsAssignOwnerOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Assign Owner
            </Button>
        </div>
      </PageHeader>
      
      <div className="mb-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
          <div className="relative">
            <label className="text-sm font-medium mb-1.5 block">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                  type="search"
                  placeholder="Search by device name..."
                  className="pl-8 w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Status</label>
            <Combobox
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'online', label: 'Online' },
                { value: 'offline', label: 'Offline' },
                { value: 'unknown', label: 'Unknown' },
                { value: 'expired', label: 'Expired' },
              ]}
              isMultiSelect
              selectedValues={statusFilter}
              onChange={(value) => {
                if (value === 'all') {
                  setStatusFilter(['all']);
                } else {
                  const newFilters = statusFilter.filter(f => f !== 'all');
                  if (newFilters.includes(value)) {
                    const updated = newFilters.filter(f => f !== value);
                    setStatusFilter(updated.length === 0 ? ['all'] : updated);
                  } else {
                    setStatusFilter([...newFilters, value]);
                  }
                }
              }}
              placeholder="Select statuses..."
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="h-10">
              <X className="mr-2 h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <OfflineDeviceWarnings />
      <DeviceList searchTerm={searchTerm} statusFilter={statusFilter} />
      <AssignOwnerDialog 
        open={isAssignOwnerOpen}
        onOpenChange={setIsAssignOwnerOpen}
      />
    </>
  );
}
