
'use client';

import PageHeader from '@/components/page-header';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import RecurringExpenseList from '@/components/dashboard/scheduler/recurring-expense-list';
import AutomatedInvoiceManager from '@/components/dashboard/scheduler/automated-invoice-manager';

export default function SchedulerPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduler"
        description="Manage recurring expenses and automated tasks."
      />

      <Tabs defaultValue="recurring-expenses" className="w-full">
        <TabsList className="grid w-full grid-cols-1 sm:w-auto sm:grid-cols-2">
          <TabsTrigger value="recurring-expenses">Recurring Expenses</TabsTrigger>
          <TabsTrigger value="automated-invoices">Automated Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="recurring-expenses">
          <RecurringExpenseList />
        </TabsContent>
        <TabsContent value="automated-invoices">
          <AutomatedInvoiceManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
