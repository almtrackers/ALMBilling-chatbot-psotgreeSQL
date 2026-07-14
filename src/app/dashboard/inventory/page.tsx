
'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import AddInventoryItemForm from '@/components/dashboard/inventory/add-inventory-item-form';
import InventoryList from '@/components/dashboard/inventory/inventory-list';
import ImportInventoryDialog from '@/components/dashboard/inventory/import-inventory-dialog';

export default function InventoryPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        description="Track your stock of trackers, SIMs, and other hardware."
      >
        <div className="flex items-center gap-2">
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Inventory from CSV</DialogTitle>
                <DialogDescription>
                  Upload a CSV file to bulk-add items to your inventory.
                </DialogDescription>
              </DialogHeader>
              <ImportInventoryDialog setDialogOpen={setIsImportDialogOpen} />
            </DialogContent>
          </Dialog>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Stock</DialogTitle>
                <DialogDescription>
                  Fill out the form to add a new item to your inventory. For trackers, provide a list of IMEI numbers.
                </DialogDescription>
              </DialogHeader>
              <AddInventoryItemForm setDialogOpen={setIsAddDialogOpen} />
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>
      <InventoryList />
    </div>
  );
}
