
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createInvoiceFromInstallationDate } from '@/lib/invoice-service';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import type { AppSettings } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';

const formSchema = z.object({
  userId: z.string().min(1, { message: 'Please select a user.' }),
});

type CreateInvoiceFormProps = {
  setDialogOpen: (open: boolean) => void;
};

export default function CreateInvoiceForm({
  setDialogOpen,
}: CreateInvoiceFormProps) {
  const { user } = useAuth();
  const { users, isLoading: isLoadingUsers } = useTraccarUsers();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const standardUsers = users?.filter(u => !u.administrator && !u.manager) || [];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userId: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in.',
      });
      return;
    }
    setIsSubmitting(true);
    
    const selectedUser = standardUsers.find(u => u.id.toString() === values.userId);
    if (!selectedUser) {
        toast({ variant: 'destructive', title: 'User not found.'});
        setIsSubmitting(false);
        return;
    }

    try {
      const { invoiceId, amount, customerName } = await createInvoiceFromInstallationDate(
        parseInt(values.userId),
        user.name,
      );

      if (invoiceId && amount > 0) {
        toast({
          title: 'Invoices Created',
          description: `Separate invoices for each period have been generated for ${customerName}. Total: ${amount.toLocaleString()}`,
        });
        setDialogOpen(false);
      } else {
        toast({
            variant: 'default',
            title: 'No Invoices Needed',
            description: `No devices requiring an invoice were found for ${selectedUser.name}.`
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to create invoice',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>How this works</AlertTitle>
          <AlertDescription>
            This tool generates separate monthly or yearly period invoices from each device installation date up to the current period.
          </AlertDescription>
        </Alert>

        <FormField
          control={form.control}
          name="userId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Select User</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user to invoice..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isLoadingUsers ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    standardUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing & Creating...
              </>
            ) : (
              'Generate Invoice for User'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
