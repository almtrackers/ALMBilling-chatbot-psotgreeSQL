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
import AddExpenseForm from '@/components/dashboard/expenses/add-expense-form';
import ExpenseList from '@/components/dashboard/expenses/expense-list';
import type { DateRange } from 'react-day-picker';

export default function ExpensesPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track all your company expenses."
      >
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Expense</DialogTitle>
              <DialogDescription>
                Fill out the form to log a new business expense.
              </DialogDescription>
            </DialogHeader>
            <AddExpenseForm setDialogOpen={setIsAddDialogOpen} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      <ExpenseList />
    </div>
  );
}
