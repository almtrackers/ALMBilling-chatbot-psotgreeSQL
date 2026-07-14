
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
import AddPersonForm from '@/components/dashboard/people/add-person-form';
import PeopleList from '@/components/dashboard/people/people-list';

export default function PeoplePage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description="Manage your employees and business partners."
      >
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Person
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Person</DialogTitle>
              <DialogDescription>
                Enter the details for the new employee or partner.
              </DialogDescription>
            </DialogHeader>
            <AddPersonForm setDialogOpen={setIsAddDialogOpen} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      <PeopleList />
    </div>
  );
}
