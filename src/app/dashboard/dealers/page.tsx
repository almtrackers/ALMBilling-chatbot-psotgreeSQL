
'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import AddDealerForm from '@/components/dashboard/dealers/add-dealer-form';
import DealerList from '@/components/dashboard/dealers/dealer-list';
import { Input } from '@/components/ui/input';

export default function DealersPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dealers"
        description="Manage your company's dealers."
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name..."
              className="pl-8 w-full sm:w-[200px] md:w-[300px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Dealer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Dealer</DialogTitle>
                <DialogDescription>
                  Enter the details for the new dealer.
                </DialogDescription>
              </DialogHeader>
              <AddDealerForm setDialogOpen={setIsAddDialogOpen} />
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>
      <DealerList searchTerm={searchTerm} />
    </div>
  );
}
