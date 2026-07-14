
'use client';

import { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import type { Invoice } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { localApiClient } from '@/lib/api';

const formSchema = z.object({
  baseAmount: z.coerce.number().min(0, 'Amount must be a positive number.'),
  simCharges: z.coerce.number().min(0, 'Amount must be a positive number.'),
  otherCharges: z.coerce.number().min(0, 'Amount must be a positive number.'),
  discount: z.coerce.number().min(0, 'Amount must be a positive number.'),
});

type EditInvoiceFormProps = {
  invoice: Invoice;
  setDialogOpen: (open: boolean) => void;
};

export default function EditInvoiceForm({
  invoice,
  setDialogOpen,
}: EditInvoiceFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      baseAmount: invoice.baseAmount || 0,
      simCharges: invoice.simCharges || 0,
      otherCharges: invoice.otherCharges || 0,
      discount: invoice.discount || 0,
    },
  });

  const { watch } = form;
  const [total, setTotal] = useState(invoice.totalAmount);

  useEffect(() => {
    const subscription = watch((values) => {
      const baseAmount = Number(values.baseAmount) || 0;
      const simCharges = Number(values.simCharges) || 0;
      const otherCharges = Number(values.otherCharges) || 0;
      const discount = Number(values.discount) || 0;
      const newTotal = baseAmount + simCharges + otherCharges - discount;
      setTotal(newTotal);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to modify an invoice.',
      });
      return;
    }
    setIsSubmitting(true);
    
    try {
      const updatedData = {
        ...values,
        totalAmount: total,
      };

      await localApiClient.patch(`/invoices/${invoice.id}`, updatedData);

      await addLog(`Edited invoice #${invoice.id}. New total: ${total}`, user.name, 'update');
      toast({
        title: 'Invoice Updated',
        description: `The details for invoice #${invoice.id} have been saved.`,
      });
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to update invoice',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="baseAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subscription Fee</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="simCharges"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SIM Charges</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="otherCharges"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Other Charges</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="discount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discount</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />
        
        <div className="flex justify-end items-center gap-4 text-lg font-bold">
            <span>New Total:</span>
            <span>PKR {total.toLocaleString()}</span>
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
