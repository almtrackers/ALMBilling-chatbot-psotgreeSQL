
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
import AddOfficeForm from '@/components/dashboard/offices/add-office-form';
import OfficeList from '@/components/dashboard/offices/office-list';

export default function OfficesPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offices"
        description="Manage your company's office locations."
      >
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Office
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Office</DialogTitle>
              <DialogDescription>
                Enter the name of the new office location.
              </DialogDescription>
            </DialogHeader>
            <AddOfficeForm setDialogOpen={setIsAddDialogOpen} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      <OfficeList />
    </div>
  );
}

    