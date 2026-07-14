
'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import StatCards from '@/components/dashboard/stat-cards';
import SubscriptionSummary from '@/components/dashboard/subscription-summary';
import RenewalPredictions from '@/components/dashboard/renewal-predictions';
import RevenueHistory from '@/components/dashboard/revenue-history';
import TransactionList from '@/components/dashboard/transaction-list';
import DeviceList from '@/components/dashboard/device-list';
import { useAuth } from '@/contexts/auth-context';
import BillingWarnings from '@/components/dashboard/billing-warnings';
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
import AddSaleForm from '@/components/dashboard/sales/add-sale-form';
import AddExpenseForm from '@/components/dashboard/expenses/add-expense-form';
import CreateUserForm from '@/components/dashboard/users/create-user-form';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import GlobalImeiSearch from '@/components/dashboard/global-imei-search';
import InvestmentDetailsDialog from '@/components/dashboard/investment-details-dialog';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [isAddSaleDialogOpen, setIsAddSaleDialogOpen] = useState(false);
  const [isAddExpenseDialogOpen, setIsAddExpenseDialogOpen] = useState(false);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isInvestmentDialogOpen, setIsInvestmentDialogOpen] = useState(false);
  const { mutate: mutateUsers } = useTraccarUsers();
  const { investments } = useDashboardStats();
  
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My Devices"
          description="A list of all your tracked devices."
        />
        <DeviceList searchTerm="" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Here's a summary of your business activities."
      >
        <div className="flex items-center gap-2">
            <Dialog open={isAddExpenseDialogOpen} onOpenChange={setIsAddExpenseDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline">
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
                    <AddExpenseForm setDialogOpen={setIsAddExpenseDialogOpen} />
                </DialogContent>
            </Dialog>
            <Dialog open={isCreateUserDialogOpen} onOpenChange={setIsCreateUserDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add User
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Standard User</DialogTitle>
                        <DialogDescription>
                            This user will have read-only access by default.
                        </DialogDescription>
                    </DialogHeader>
                    <CreateUserForm setDialogOpen={setIsCreateUserDialogOpen} onUserCreated={mutateUsers} />
                </DialogContent>
            </Dialog>
            <Dialog open={isAddSaleDialogOpen} onOpenChange={setIsAddSaleDialogOpen}>
                <DialogTrigger asChild>
                    <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Sale
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                    <DialogTitle>Add New Sale</DialogTitle>
                    <DialogDescription>
                        Register a new device in Traccar and record the sale details.
                    </DialogDescription>
                    </DialogHeader>
                    <AddSaleForm setDialogOpen={setIsAddSaleDialogOpen} />
                </DialogContent>
            </Dialog>
        </div>
      </PageHeader>
      <div className="space-y-6">
        <GlobalImeiSearch />
        <BillingWarnings />
        <StatCards onInvestmentClick={() => setIsInvestmentDialogOpen(true)} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <SubscriptionSummary />
          <RevenueHistory />
        </div>
        <TransactionList />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RenewalPredictions />
        </div>
      </div>
      <InvestmentDetailsDialog 
        open={isInvestmentDialogOpen}
        onOpenChange={setIsInvestmentDialogOpen}
        investments={investments}
      />
    </>
  );
}
