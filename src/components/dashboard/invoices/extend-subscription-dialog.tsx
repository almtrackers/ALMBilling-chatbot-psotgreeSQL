
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import type { Invoice, Device } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useDevices } from '@/hooks/use-devices';
import { addDays, differenceInDays } from 'date-fns';
import { apiClient } from '@/lib/api';

const UNLIMITED_TRACCAR_EXPIRY = '2099-12-31T23:59:59Z';

const formSchema = z.object({
  extensionDays: z.coerce
    .number()
    .int()
    .min(0, 'Must extend for at least 0 days.')
    .max(90, 'Extension cannot exceed 90 days.'),
});

type ExtendSubscriptionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
};

export default function ExtendSubscriptionDialog({
  open,
  onOpenChange,
  invoice,
}: ExtendSubscriptionDialogProps) {
  const { user } = useAuth();
  const { devices } = useDevices();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      extensionDays: 7,
    },
  });

  useEffect(() => {
    if (invoice && open) {
        if (invoice.extensionDays && invoice.extensionGrantedAt) {
            const extensionDate = invoice.extensionGrantedAt instanceof Date 
                ? invoice.extensionGrantedAt 
                : new Date(invoice.extensionGrantedAt);
            const usedDays = differenceInDays(new Date(), extensionDate);
            const remainingDays = Math.max(0, invoice.extensionDays - usedDays);
            form.setValue('extensionDays', remainingDays);
        } else {
            form.setValue('extensionDays', 7); // Default if no prior extension
        }
    }
  }, [invoice, open, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user || !invoice || !devices) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Missing required data to grant extension.',
      });
      return;
    }
    setIsSubmitting(true);

    try {
      const periodEndDate = invoice.periodEnd instanceof Date 
        ? invoice.periodEnd 
        : new Date(invoice.periodEnd);
      const newExpiryDate = addDays(periodEndDate, values.extensionDays);

      // Call the extension API
      await apiClient.post('/invoices/extend', {
        invoiceId: invoice.id,
        extensionDays: values.extensionDays,
        devices: devices
      });

      await addLog(
        `Granted a ${values.extensionDays}-day extension for invoice #${invoice.id}`,
        user.name,
        'update'
      );
      toast({
        title: 'Subscription Extended',
        description: `The subscription has been extended by ${values.extensionDays} days.`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Extension Failed',
        description: error.response?.data?.error || error.message || 'Could not update the extension.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extend Subscription</DialogTitle>
          <DialogDescription>
            Grant a temporary extension for the devices on invoice #{invoice.id}.
            The invoice will remain pending.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="extensionDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Days to Extend</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Grant Extension
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
