
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
import AddEmployeeForm from '@/components/dashboard/employees/add-employee-form';
import EmployeeList from '@/components/dashboard/employees/employee-list';

export default function EmployeesPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your company's employees."
      >
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Enter the details for the new employee.
              </DialogDescription>
            </DialogHeader>
            <AddEmployeeForm setDialogOpen={setIsAddDialogOpen} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      <EmployeeList />
    </div>
  );
}
