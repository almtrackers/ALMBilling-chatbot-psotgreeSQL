
'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import type { Expense, Person, Dealer } from '@/lib/types';
import { useExpenses } from '@/hooks/use-expenses';
import { usePersons } from '@/hooks/use-persons';
import { useDealers } from '@/hooks/use-dealers';
import { useUserPin } from '@/hooks/use-user-pin';
import axios from 'axios';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { format, isWithinInterval, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import { ServerCrash, MoreHorizontal, FileText, Repeat, Download, Filter, Search, X, Calendar as CalendarIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AddExpenseForm from './add-expense-form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { addLog } from '@/lib/log-service';
import { useToast } from '@/hooks/use-toast';
import { createApprovalRequest } from '@/lib/approval-service';
import PinDialog from '@/components/auth/pin-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

const RECORDS_PER_PAGE = 15;

const expenseTypes: Expense['type'][] = ['fuel', 'staff_salary', 'installation', 'sim_charges', 'rent', 'stock_purchase', 'other', 'people_transaction', 'commission'];

export default function ExpenseList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const { expenses, isLoading: isLoadingExpenses, isError: error, mutate } = useExpenses();
  const { persons: people, isLoading: isLoadingPeople } = usePersons();
  const { dealers, isLoading: isLoadingDealers } = useDealers();
  const { pinStatus: userPin } = useUserPin(user?.traccarId);

  const peopleMap = useMemo(() => {
    if (!people) return new Map();
    return new Map(people.map(p => [p.id, p.name]));
  }, [people]);
  const dealerMap = useMemo(() => {
    if (!dealers) return new Map();
    return new Map(dealers.map(d => [d.id, d.name]));
  }, [dealers]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    const filtered = expenses.filter(expense => {
      const searchTermMatch = searchTerm === '' || expense.title.toLowerCase().includes(searchTerm.toLowerCase());
      const statusMatch = statusFilter === 'all' || expense.status === statusFilter;
      const categoryMatch = categoryFilter === 'all' || expense.type === categoryFilter;
      const personMatch = personFilter === 'all' || expense.personId === personFilter;
      
      let dateMatch = true;
      if (dateRange?.from) {
        const expenseDate = typeof expense.date === 'string' ? new Date(expense.date) : expense.date;
        dateMatch = isWithinInterval(expenseDate, {start: dateRange.from, end: dateRange.to || dateRange.from });
      }

      return searchTermMatch && statusMatch && categoryMatch && personMatch && dateMatch;
    });

    return filtered;

  }, [expenses, searchTerm, statusFilter, categoryFilter, personFilter, dateRange]);

  const paginatedExpenses = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredExpenses.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredExpenses, currentPage]);

  const totalPages = Math.ceil(filteredExpenses.length / RECORDS_PER_PAGE);

  const isLoading = isLoadingExpenses || isLoadingPeople || isLoadingDealers;

  const personBalanceDetails = useMemo(() => {
    if (personFilter === 'all' || !filteredExpenses) return null;
    
    const summary = filteredExpenses.reduce((acc, tx) => {
        if (tx.personId === personFilter) {
             if (tx.transactionType === 'incoming') {
                acc.totalIncoming += Number(tx.amount);
            } else if (tx.transactionType === 'outgoing') {
                acc.totalOutgoing += Number(tx.amount);
            }
        }
        return acc;
    }, { totalIncoming: 0, totalOutgoing: 0 });

    return {
        ...summary,
        netBalance: summary.totalIncoming - summary.totalOutgoing,
    };
  }, [personFilter, filteredExpenses]);
  
  const filteredTotal = useMemo(() => {
    if (!filteredExpenses) return 0;
    // Exclude 'incoming' (investment) transactions from the expense total
    return filteredExpenses.reduce((acc, expense) => {
        if (expense.type === 'people_transaction' && expense.transactionType === 'incoming') {
            return acc;
        }
        return acc + Number(expense.amount);
    }, 0);
  }, [filteredExpenses]);


  const openDeleteDialog = (expense: Expense) => {
    if (expense.status === 'approved') {
      toast({
        variant: 'destructive',
        title: 'Cannot Delete Approved Expense',
        description: 'Approved expenses cannot be deleted. You must first mark it as pending.',
      });
      return;
    }
    setSelectedExpense(expense);
    setIsAlertOpen(true);
  };

  const openEditDialog = (expense: Expense) => {
    if (expense.status === 'approved') {
      toast({
        variant: 'destructive',
        title: 'Cannot Edit Approved Expense',
        description: 'Approved expenses cannot be edited. You must first mark it as pending.',
      });
      return;
    }
    setSelectedExpense(expense);
    setIsEditDialogOpen(true);
  };
  
  const confirmDeletion = () => {
    setIsAlertOpen(false);
    if (userPin?.hasPin) {
      setIsPinDialogOpen(true);
    } else {
      handleDelete();
    }
  };

  const handleDelete = async () => {
    if (selectedExpense && user) {
      try {
        await axios.delete(`/api/expenses?id=${selectedExpense.id}`);
        await addLog(`Deleted expense: "${selectedExpense.title}" (ID: ${selectedExpense.id})`, user.name, 'delete');
        mutate();
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: err.response?.data?.message || 'Failed to delete expense',
        });
      }
      setSelectedExpense(null);
    }
    setIsAlertOpen(false);
    setIsPinDialogOpen(false);
  };

  const handleApprove = async (expense: Expense) => {
    if (!user || !user.email) {
        toast({ variant: 'destructive', title: 'Authentication Error', description: 'Cannot verify your identity.' });
        return;
    }
    const payload = {
        newStatus: expense.status === 'approved' ? 'pending' : 'approved',
    };
    const result = await createApprovalRequest('approve_expense', expense.id, payload, { uid: user.email, name: user.name });

    if (result === 'auto_approved') {
        const updatedStatus = expense.status === 'approved' ? 'pending' : 'approved';
        try {
          await axios.put('/api/expenses', {
              id: expense.id,
              status: updatedStatus,
              approvedBy: updatedStatus === 'approved' ? user.name : null,
              approvedAt: updatedStatus === 'approved' ? new Date().toISOString() : null,
          });
          await addLog(`(Auto-Approved) Changed expense status to ${updatedStatus} for: "${expense.title}"`, user.name, 'update');
          toast({ title: 'Action Completed', description: 'As you are the only admin, the action was automatically approved.' });
          mutate();
        } catch (err: any) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: err.response?.data?.message || 'Failed to update expense status',
          });
        }
    }
  };

  const formatExpenseType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusBadge = (status: 'pending' | 'approved') => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending</Badge>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const handleExport = () => {
    if (!expenses || expenses.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Expenses to Export',
        description: 'There is no data to export.',
      });
      return;
    }

    const header = ['id', 'title', 'amount', 'type', 'date', 'status', 'notes', 'createdBy', 'approvedBy', 'approvedAt'];
    const csvRows = [
      header.join(','),
      ...expenses.map((expense) => {
        const expenseDate = typeof expense.date === 'string' ? new Date(expense.date) : expense.date;
        const date = expenseDate ? format(expenseDate, 'yyyy-MM-dd HH:mm:ss') : 'N/A';
        
        let approvedAt = '';
        if (expense.approvedAt) {
          const approvedAtDate = typeof expense.approvedAt === 'string' ? new Date(expense.approvedAt) : expense.approvedAt;
          approvedAt = format(approvedAtDate, 'yyyy-MM-dd HH:mm:ss');
        }
        
        const title = `"${expense.title.replace(/"/g, '""')}"`;
        const notes = `"${(expense.notes || '').replace(/"/g, '""')}"`;

        return [
            expense.id,
            title,
            expense.amount,
            expense.type,
            date,
            expense.status,
            notes,
            expense.createdBy,
            expense.approvedBy || '',
            approvedAt
        ].join(',');
      }),
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    link.setAttribute('download', `expenses-export-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Export Started',
      description: 'Your expense file download has begun.',
    });
  };
  
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    switch (preset) {
        case 'current_month':
            setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
            break;
        case 'last_month':
            const lastMonth = subMonths(now, 1);
            setDateRange({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
            break;
        case 'current_year':
            setDateRange({ from: startOfYear(now), to: endOfYear(now) });
            break;
        case 'last_year':
            const lastYear = subYears(now, 1);
            setDateRange({ from: startOfYear(lastYear), to: endOfYear(lastYear) });
            break;
        case 'all':
        default:
            setDateRange(undefined);
            break;
    }
  }

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setPersonFilter('all');
    setDateRange(undefined);
    setDatePreset('all');
  };
  
  const hasActiveFilters = searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || personFilter !== 'all' || dateRange;

  if (isLoading || isLoadingPeople || isLoadingDealers) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expense Log</CardTitle>
          <CardDescription>Fetching your expenses...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expense Log</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load expenses</AlertTitle>
            <AlertDescription>
              There was a problem fetching your expense data. Please check your
              connection and try again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Expense Log</CardTitle>
              <CardDescription>
                  A list of all your business expenses.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!expenses || expenses.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="mb-4 border rounded-lg">
            <AccordionItem value="filters" className="border-0">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4 border-t">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-end gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Search Title</label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Filter by title..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                   <div className="space-y-2">
                    <label className="text-sm font-medium">Person</label>
                    <Select value={personFilter} onValueChange={setPersonFilter}>
                      <SelectTrigger><SelectValue placeholder="Filter by person..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All People</SelectItem>
                        {people?.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                   <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger><SelectValue placeholder="Filter by category..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {expenseTypes.map(type => (
                           <SelectItem key={type} value={type}>{formatExpenseType(type)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                   <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger><SelectValue placeholder="Filter by status..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-sm font-medium">Date Range</label>
                      <Select value={datePreset} onValueChange={handleDatePresetChange}>
                          <SelectTrigger>
                              <SelectValue placeholder="Select period..." />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="all">All Time</SelectItem>
                              <SelectItem value="current_month">Current Month</SelectItem>
                              <SelectItem value="last_month">Last Month</SelectItem>
                              <SelectItem value="current_year">Current Year</SelectItem>
                              <SelectItem value="last_year">Last Year</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-sm font-medium">Custom Date</label>
                      <Popover>
                      <PopoverTrigger asChild>
                          <Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal",!dateRange && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : (format(dateRange.from, "LLL dd, y"))) : (<span>Pick a date</span>)}
                          </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" align="start">
                          <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={(range) => { setDateRange(range); setDatePreset('custom'); }} numberOfMonths={2}/>
                      </PopoverContent>
                      </Popover>
                  </div>

                  {hasActiveFilters && (
                    <Button variant="ghost" onClick={clearFilters} className="w-full">
                        <X className="mr-2 h-4 w-4" />
                        Clear Filters
                    </Button>
                  )}
                </div>
                {personBalanceDetails && (
                    <div className="mt-4 pt-4 border-t">
                         <h4 className="text-lg font-semibold text-muted-foreground">
                            Balance for <span className="text-foreground">{peopleMap.get(personFilter)}</span>
                        </h4>
                        <div className="flex items-center gap-4 text-base">
                            <span className="text-green-600">Total In: PKR {personBalanceDetails.totalIncoming.toLocaleString()}</span>
                            <span>-</span>
                            <span className="text-red-600">Total Out: PKR {personBalanceDetails.totalOutgoing.toLocaleString()}</span>
                            <span>=</span>
                             <span className={`font-bold ${personBalanceDetails.netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                Net Balance: PKR {personBalanceDetails.netBalance.toLocaleString()}
                            </span>
                        </div>
                    </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approval Info</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedExpenses.length > 0 ? (
                  paginatedExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        {expense.isRecurring && (
                           <Tooltip>
                            <TooltipTrigger>
                              <Repeat className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Recurring {expense.recurringFrequency}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {expense.title}
                        {expense.personId && <Badge variant="outline">{peopleMap.get(expense.personId)}</Badge>}
                        {expense.dealerId && <Badge variant="outline">{dealerMap.get(expense.dealerId)}</Badge>}
                      </TableCell>
                      <TableCell className={expense.transactionType === 'incoming' ? 'text-green-600' : expense.transactionType === 'outgoing' ? 'text-red-600' : ''}>
                        PKR {Number(expense.amount).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {formatExpenseType(expense.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {expense.date ? format(new Date(expense.date), 'PP') : 'Invalid Date'}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(expense.status || 'pending')}
                      </TableCell>
                      <TableCell>
                        {expense.approvedAt ? (
                          <div className="text-xs">
                            <div>
                              {format(new Date(expense.approvedAt), 'PP')}
                            </div>
                            <div className="text-muted-foreground">
                              by {expense.approvedBy}
                            </div>
                          </div>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-haspopup="true"
                              size="icon"
                              variant="ghost"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                             <DropdownMenuItem onClick={() => handleApprove(expense)}>
                                {expense.status === 'approved' ? 'Request to Mark as Pending' : 'Request Approval'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openEditDialog(expense)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600 focus:bg-red-50"
                              onClick={() => openDeleteDialog(expense)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <p>No expenses found.</p>
                        <p className="text-xs">
                           {hasActiveFilters ? "Try adjusting your filters." : 'Use the "Add Expense" button to start logging.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="text-right font-bold">Total</TableCell>
                  <TableCell className="font-bold">
                    PKR {filteredTotal.toLocaleString()}
                  </TableCell>
                  <TableCell colSpan={5}></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TooltipProvider>
           <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages > 0 ? totalPages : 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Next
              </Button>
            </div>
        </CardContent>
      </Card>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this
              expense record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDeletion}
            >
              Yes, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>
              Update the details for this expense record.
            </DialogDescription>
          </DialogHeader>
          <AddExpenseForm
            setDialogOpen={setIsEditDialogOpen}
            expenseToEdit={selectedExpense!}
          />
        </DialogContent>
      </Dialog>
      
      <PinDialog
        open={isPinDialogOpen}
        onOpenChange={setIsPinDialogOpen}
        onSuccess={handleDelete}
        actionDescription={`delete expense: ${selectedExpense?.title}`}
      />
    </>
  );
}
