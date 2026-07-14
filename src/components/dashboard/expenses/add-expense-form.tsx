
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import type { Expense, Person, Dealer } from '@/lib/types';
import { addLog } from '@/lib/log-service';
import { Separator } from '@/components/ui/separator';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { useExpenses } from '@/hooks/use-expenses';
import { usePersons } from '@/hooks/use-persons';
import { useDealers } from '@/hooks/use-dealers';

const formSchema = z
  .object({
    title: z.string().optional(),
    amount: z.coerce.number().min(1, 'Amount must be greater than 0.'),
    type: z.enum([
      'fuel',
      'staff_salary',
      'installation',
      'sim_charges',
      'rent',
      'stock_purchase',
      'people_transaction',
      'commission',
      'other',
    ]),
    date: z.date(),
    notes: z.string().optional(),
    isRecurring: z.boolean().default(false),
    recurringFrequency: z.enum(['monthly', 'yearly']).optional(),
    personId: z.string().optional(),
    dealerId: z.string().optional(),
    recipientId: z.string().optional(), // Combined field for commission
    transactionType: z.enum(['incoming', 'outgoing']).optional(),
  })
   .refine(
    (data) => {
      if (!['people_transaction', 'commission'].includes(data.type)) {
        return !!data.title && data.title.length > 0;
      }
      return true;
    },
    {
      message: 'Title is required for this expense type.',
      path: ['title'],
    }
  )
  .refine(
    (data) => {
      if (data.isRecurring && !data.recurringFrequency) {
        return false;
      }
      return true;
    },
    {
      message: 'Frequency is required for recurring expenses.',
      path: ['recurringFrequency'],
    }
  )
  .refine(
    (data) => {
        if (data.type === 'people_transaction' && !data.personId) {
            return false;
        }
        if (data.type === 'commission' && !data.recipientId) {
            return false;
        }
        return true;
    },
    {
        message: 'Please select a recipient.',
        path: ['recipientId'],
    }
  )
    .refine(
    (data) => {
        if (data.type === 'people_transaction' && !data.transactionType) {
            return false;
        }
        return true;
    },
    {
        message: 'Please select a transaction type.',
        path: ['transactionType'],
    }
  );

type AddExpenseFormProps = {
  setDialogOpen: (open: boolean) => void;
  expenseToEdit?: Expense;
};

export default function AddExpenseForm({
  setDialogOpen,
  expenseToEdit,
}: AddExpenseFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!expenseToEdit;
  
  const { mutate } = useExpenses();
  const { persons: people, isLoading: isLoadingPeople } = usePersons();
  const { dealers, isLoading: isLoadingDealers } = useDealers();
  
  const peopleMap = useMemo(() => new Map(people?.map(p => [p.id, p.name])), [people]);
  const dealerMap = useMemo(() => new Map(dealers?.map(d => [d.id, d.name])), [dealers]);
  const personIdFromUrl = params.id as string | undefined;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      amount: 0,
      type: personIdFromUrl ? 'people_transaction' : 'other',
      date: new Date(),
      notes: '',
      isRecurring: false,
      personId: personIdFromUrl,
    },
  });

  const isRecurring = form.watch('isRecurring');
  const expenseType = form.watch('type');

  useEffect(() => {
    if (isEditMode && expenseToEdit) {
        let recipientId;
        if(expenseToEdit.type === 'commission') {
            recipientId = expenseToEdit.dealerId ? `dealer_${expenseToEdit.dealerId}` : (expenseToEdit.personId ? `person_${expenseToEdit.personId}` : undefined);
        }

      const expenseDate = typeof expenseToEdit.date === 'string' ? new Date(expenseToEdit.date) : expenseToEdit.date;

      form.reset({
        title: expenseToEdit.title,
        amount: expenseToEdit.amount,
        type: expenseToEdit.type,
        date: expenseDate,
        notes: expenseToEdit.notes || '',
        isRecurring: expenseToEdit.isRecurring || false,
        recurringFrequency: expenseToEdit.recurringFrequency,
        personId: expenseToEdit.personId,
        dealerId: expenseToEdit.dealerId,
        recipientId: recipientId,
        transactionType: expenseToEdit.transactionType,
      });
    }
  }, [isEditMode, expenseToEdit, form]);
  
  useEffect(() => {
    if (personIdFromUrl) {
      form.setValue('personId', personIdFromUrl);
      form.setValue('type', 'people_transaction');
    }
  }, [personIdFromUrl, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to modify an expense.',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      let finalTitle = values.title;
      const expenseDataPayload: any = {
        amount: values.amount,
        type: values.type,
        date: values.date.toISOString(),
        monthId: format(values.date, 'yyyy-MM'),
        notes: values.notes,
        isRecurring: values.isRecurring,
      };

      if (values.type === 'people_transaction' && values.personId) {
        const personName = peopleMap.get(values.personId) || 'Unknown Person';
        finalTitle = values.transactionType === 'incoming' ? `Investment from ${personName}` : `Pay to ${personName}`;
        expenseDataPayload.personId = values.personId;
        expenseDataPayload.transactionType = values.transactionType;
      } else if (values.type === 'commission' && values.recipientId) {
        const [recipientType, recipientId] = values.recipientId.split('_');
        let recipientName = 'Unknown';
        if (recipientType === 'dealer') {
            expenseDataPayload.dealerId = recipientId;
            recipientName = dealerMap.get(recipientId) || 'Unknown Dealer';
        } else {
            expenseDataPayload.personId = recipientId;
            recipientName = peopleMap.get(recipientId) || 'Unknown Person';
        }
        finalTitle = `Commission for ${recipientName}`;
      }
      
      expenseDataPayload.title = finalTitle;

      if (values.isRecurring) {
        expenseDataPayload.recurringFrequency = values.recurringFrequency;
      }

      if (isEditMode && expenseToEdit) {
        await axios.put('/api/expenses', {
          id: expenseToEdit.id,
          ...expenseDataPayload
        });
        await addLog(`Updated expense: "${finalTitle}" (ID: ${expenseToEdit.id})`, user.name, 'update');
        toast({
          title: 'Expense Updated',
          description: `${finalTitle} has been updated successfully.`,
        });
      } else {
        const expenseData = {
          ...expenseDataPayload,
          createdBy: user.name,
          status: 'pending',
        };
        await axios.post('/api/expenses', expenseData);
        await addLog(`Added new expense: "${finalTitle}" for PKR ${values.amount}`, user.name, 'create');
        toast({
          title: 'Expense Added',
          description: `${finalTitle} has been logged successfully.`,
        });
      }
      mutate();
      form.reset();
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: isEditMode ? 'Failed to update expense' : 'Failed to add expense',
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {expenseType !== 'people_transaction' && expenseType !== 'commission' && (
            <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                    <Input placeholder="e.g., Office Rent, Salary for Ali" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
        )}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount (PKR)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="5000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!!personIdFromUrl}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="fuel">Fuel</SelectItem>
                    <SelectItem value="staff_salary">Staff Salary</SelectItem>
                    <SelectItem value="installation">Installation</SelectItem>
                    <SelectItem value="sim_charges">SIM Charges</SelectItem>
                    <SelectItem value="rent">Rent</SelectItem>
                    <SelectItem value="stock_purchase">Stock Purchase</SelectItem>
                    <SelectItem value="people_transaction">People Transaction</SelectItem>
                    <SelectItem value="commission">Commission</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        {expenseType === 'people_transaction' && (
            <div className="space-y-4 rounded-md border p-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="personId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Person</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingPeople || !!personIdFromUrl}>
                                <FormControl>
                                    <SelectTrigger>
                                    <SelectValue placeholder="Select a person..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {people?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="transactionType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Transaction Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                    <SelectValue placeholder="Select type..." />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="incoming">Incoming (Investment)</SelectItem>
                                    <SelectItem value="outgoing">Outgoing (Pay to)</SelectItem>
                                </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>
        )}

        {expenseType === 'commission' && (
             <div className="space-y-4 rounded-md border p-4">
                 <FormField
                    control={form.control}
                    name="recipientId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Recipient</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingPeople || isLoadingDealers}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Select a dealer or person..." />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {dealers && dealers.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Dealers</SelectLabel>
                                        {dealers.map(d => <SelectItem key={d.id} value={`dealer_${d.id}`}>{d.name}</SelectItem>)}
                                    </SelectGroup>
                                )}
                                 {people && people.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>People</SelectLabel>
                                        {people.map(p => <SelectItem key={p.id} value={`person_${p.id}`}>{p.name}</SelectItem>)}
                                    </SelectGroup>
                                )}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
             </div>
        )}

        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Date of Expense</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={'outline'}
                      className={cn(
                        'w-full pl-3 text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      {field.value ? (
                        format(field.value, 'PPP')
                      ) : (
                        <span>Pick a date</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) =>
                      date > new Date() || date < new Date('1900-01-01')
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any relevant details..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4 rounded-md border p-4">
          <FormField
            control={form.control}
            name="isRecurring"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between">
                <div className="space-y-0.5">
                  <FormLabel>Schedule this expense</FormLabel>
                  <FormMessage />
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          {isRecurring && (
            <FormField
              control={form.control}
              name="recurringFrequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isEditMode ? (
              'Save Changes'
            ) : (
              'Save Expense'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
