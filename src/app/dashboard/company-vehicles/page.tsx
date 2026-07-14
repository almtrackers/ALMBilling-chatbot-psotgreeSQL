'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import CompanyVehicleList from '@/components/dashboard/company-vehicles/company-vehicle-list';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export default function CompanyVehiclesPage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Vehicles"
        description="A list of all vehicles registered as company assets."
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by vehicle or driver..."
            className="pl-8 w-full sm:w-[200px] md:w-[300px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </PageHeader>
      <CompanyVehicleList searchTerm={searchTerm} />
    </div>
  );
}
