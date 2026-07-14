
'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import AllocateStockForm from '@/components/dashboard/stock-distribution/allocate-stock-form';
import AllocationList from '@/components/dashboard/stock-distribution/allocation-list';

export default function StockDistributionPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Distribution"
        description="Allocate inventory to different office locations."
      >
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Allocate Stock
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Allocate Stock to an Office</DialogTitle>
              <DialogDescription>
                Select an item from your central inventory to send to an office.
              </DialogDescription>
            </DialogHeader>
            <AllocateStockForm setDialogOpen={setIsAddDialogOpen} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      <AllocationList />
    </div>
  );
}

    