
'use client';

import { useState, useMemo } from 'react';
import axios from 'axios';
import { useExpenses } from '@/hooks/use-expenses';
import { useAppSettings } from '@/hooks/use-app-settings';
import type { Expense } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import {
  ServerCrash,
  CalendarOff,
  Repeat,
  Settings2,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDevices } from '@/hooks/use-devices';
import { generateSimExpenses } from '@/lib/expense-service';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';

export default function RecurringExpenseList() {
  const { toast } = useToast();
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const { user } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [checkStatus, setCheckStatus] = useState<
    'idle' | 'exists' | 'not_exists'
  >('idle');

  const { expenses: allExpenses, isLoading: isLoadingExpenses, error, mutate } = useExpenses();
  const { appSettings: settings, isLoading: isLoadingSettings } = useAppSettings();

  const recurringExpenses = useMemo(() => {
    if (!allExpenses) return [];
    return allExpenses.filter(e => e.isRecurring);
  }, [allExpenses]);

  const handleGenerateNow = async (expense: Expense) => {
    if (!user) return;
    const today = new Date();
    const newExpenseData = {
      ...expense,
      date: today.toISOString(),
      monthId: format(today, 'yyyy-MM'),
      isRecurring: false, // The generated instance is not recurring
      recurringFrequency: undefined,
      title: `${expense.title} (Generated from Schedule)`,
      status: 'pending',
      createdBy: user.name,
    };

    // Remove original expense ID to create a new document
    delete (newExpenseData as any).id;

    try {
        await axios.post('/api/expenses', newExpenseData);
        await addLog(`Manually generated expense from schedule: "${expense.title}"`, user.name, 'automation');

        toast({
            title: 'Expense Generated',
            description: `A new expense for "${expense.title}" has been created.`,
        });
        mutate();
    } catch (err: any) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: err.response?.data?.message || 'Failed to generate expense',
        });
    }
  };

  const formatExpenseType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setCheckStatus('idle');
    const monthId = format(new Date(), 'yyyy-MM');

    try {
      const response = await axios.get(`/api/expenses?type=sim_charges&monthId=${monthId}`);
      if (response.data.length === 0) {
        setCheckStatus('not_exists');
      } else {
        setCheckStatus('exists');
      }
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Error Checking Status',
        description: 'Could not query the database. Please try again.',
      });
      setCheckStatus('idle');
    } finally {
      setIsChecking(false);
    }
  };

  const handleGenerateSimExpense = async () => {
    if (!user || !settings) {
      toast({
        variant: 'destructive',
        title: 'Prerequisites Missing',
        description: 'Cannot generate expense without user or settings.',
      });
      return;
    }

    if (activeDeviceCount === 0) {
      toast({
        variant: 'destructive',
        title: 'No Active Devices',
        description: 'Cannot generate SIM expense with zero active devices.',
      });
      return;
    }

    setIsGenerating(true);
    try {
      await generateSimExpenses(user.name, activeDeviceCount, settings);
      
      const monthName = format(new Date(), 'MMMM yyyy');
      await addLog(`Generated monthly SIM charge expense for ${monthName}`, user.name, 'automation');
      
      toast({
        title: 'SIM Expense Generated',
        description: `Expense for ${monthName} has been created successfully.`,
      });
      
      setCheckStatus('exists');
      mutate();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: 'There was an error creating the expense.',
      });
    } finally {
      setIsGenerating(false);
    }
  };


  const isLoading = isLoadingExpenses || isLoadingDevices || isLoadingSettings;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(1)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Recurring Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load recurring expenses</AlertTitle>
            <AlertDescription>
              There was a problem fetching your data. Please try again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const activeDeviceCount = devices?.length || 0;
  const simCostPerDevice = settings?.simCostPerDevice ?? 150;
  const totalSimCharge = activeDeviceCount * simCostPerDevice;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            System Automation
          </CardTitle>
          <CardDescription>
            This system task runs automatically and is not user-configurable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <h4 className="font-semibold">Automated SIM Charges</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Once a month, the system automatically creates a single
                'sim_charges' expense. The total amount is calculated based on
                the number of active devices at that time.
              </p>
              <div className="text-sm border-t pt-2 mt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Amount per device (from settings):
                  </span>
                  <span>PKR {simCostPerDevice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Current active devices:
                  </span>
                  <span>{activeDeviceCount}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Expected monthly charge:</span>
                  <span>PKR {totalSimCharge.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCheckStatus}
                disabled={isChecking}
              >
                {isChecking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Check This Month's Status"
                )}
              </Button>

              {checkStatus === 'exists' && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertTitle>Status: Generated</AlertTitle>
                  <AlertDescription>
                    The SIM charge for {format(new Date(), 'MMMM yyyy')} has
                    already been generated.
                  </AlertDescription>
                </Alert>
              )}
              {checkStatus === 'not_exists' && (
                <Alert variant="destructive">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>Status: Not Generated</AlertTitle>
                      </div>
                      <AlertDescription>
                        The SIM charge for {format(new Date(), 'MMMM yyyy')} has not
                        been generated yet.
                      </AlertDescription>
                    </div>
                     <Button
                      size="sm"
                      onClick={handleGenerateSimExpense}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Generate Now'
                      )}
                    </Button>
                  </div>
                </Alert>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Recurring Expenses</CardTitle>
          <CardDescription>
            These are templates for expenses that occur regularly. You can
            manually generate an expense from a template at any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurringExpenses && recurringExpenses.length > 0 ? (
                recurringExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-muted-foreground" />
                      {expense.title}
                    </TableCell>
                    <TableCell>PKR {expense.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {formatExpenseType(expense.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {expense.recurringFrequency}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateNow(expense)}
                      >
                        Generate Now
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <CalendarOff className="h-8 w-8" />
                      <p>No recurring expenses found.</p>
                      <p className="text-xs">
                        You can create one from the "Expenses" page.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
