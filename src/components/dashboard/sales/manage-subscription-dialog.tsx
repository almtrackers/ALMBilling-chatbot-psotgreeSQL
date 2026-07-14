
'use client';

import { useState, useMemo } from 'react';
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
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import type { Sale, InventoryItem, SimCard } from '@/lib/types';
import { addLog } from '@/lib/log-service';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import { useDevices } from '@/hooks/use-devices';
import { apiClient, localApiClient } from '@/lib/api';

const UNLIMITED_TRACCAR_EXPIRY = '2099-12-31T23:59:59Z';

const formSchema = z.object({
  unsubscribeReason: z.string().min(1, 'Reason for unsubscribing is required.'),
  returnedItems: z.array(z.string()),
  trackerCondition: z.enum(['working', 'faulty']).optional(),
  relayCondition: z.enum(['working', 'faulty']).optional(),
  simCondition: z.enum(['working', 'faulty']).optional(),
});

type ManageSubscriptionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
};

export default function ManageSubscriptionDialog({ open, onOpenChange, sale }: ManageSubscriptionDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { devices, mutate: mutateDevices } = useDevices();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      unsubscribeReason: '',
      returnedItems: [],
      trackerCondition: 'working',
      relayCondition: 'working',
      simCondition: 'working',
    },
  });

  const returnedItems = form.watch('returnedItems');

  const hardwareItems = [
    { id: 'tracker', label: 'Tracker', disabled: !sale?.trackerId },
    { id: 'relay', label: 'Relay', disabled: !sale?.relayId || sale.relayId === 'not-used' },
    { id: 'sim', label: 'SIM Card', disabled: !sale?.simId },
  ];

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user || !sale) {
      toast({ variant: 'destructive', title: 'Error', description: 'Required data is missing.' });
      return;
    }
    setIsSubmitting(true);
    
    try {
        // 1. Prepare returned items data
        const returnedItemsData = values.returnedItems.map(itemType => {
            const condition = values[`${itemType}Condition` as keyof typeof values] as string;
            const itemId = sale[`${itemType}Id` as keyof Sale] as string;
            return {
                id: itemId,
                type: itemType,
                condition,
                imei: itemType === 'tracker' ? sale.imei : null,
                simNumber: itemType === 'sim' ? sale.simNumber : null,
                imsi: itemType === 'sim' ? sale.imsi : null,
            };
        });

        // 2. Call local API for unsubscription (MySQL updates + Restock)
        const response = await localApiClient.post('/sales/unsubscribe', {
            saleId: sale.id,
            unsubscribeReason: values.unsubscribeReason,
            returnedItems: returnedItemsData,
        });

        if (!response.data.success) {
            throw new Error(response.data.message || 'Failed to update sale record.');
        }

        // 3. Disable device on Traccar server
        const device = devices?.find(d => d.uniqueId === sale.imei);
        if (device) {
            await apiClient.put(`/devices/${device.id}`, {
              ...device,
              disabled: true,
              expirationTime: UNLIMITED_TRACCAR_EXPIRY,
              attributes: {
                ...device.attributes,
                expiryDate: null,
              },
            });
        }

        await addLog(`Unsubscribed vehicle ${sale.vehicleNumber}. Reason: ${values.unsubscribeReason}`, user.name, 'update');
        if (response.data.restockLog) {
            await addLog(response.data.restockLog, 'System', 'update');
        }
        
        mutateDevices();
        toast({ title: 'Subscription Canceled', description: `The subscription for ${sale.vehicleNumber} has been ended.` });
        onOpenChange(false);
        form.reset();

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Operation Failed',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if(!sale) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if(!o) form.reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Subscription for {sale.vehicleNumber}</DialogTitle>
          <DialogDescription>
            End the subscription and manage the return of hardware.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="unsubscribeReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Unsubscribing</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., Customer sold vehicle, non-payment..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            
            <FormField
                control={form.control}
                name="returnedItems"
                render={() => (
                    <FormItem>
                    <div className="mb-4">
                        <FormLabel className="text-base">Hardware Return</FormLabel>
                        <FormMessage />
                    </div>
                    <div className="space-y-4">
                        {hardwareItems.map((item) => (
                        <FormField
                            key={item.id}
                            control={form.control}
                            name="returnedItems"
                            render={({ field }) => (
                            <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                <Checkbox
                                    checked={field.value?.includes(item.id)}
                                    onCheckedChange={(checked) => {
                                        return checked
                                        ? field.onChange([...field.value, item.id])
                                        : field.onChange(
                                            field.value?.filter(
                                                (value) => value !== item.id
                                            )
                                            );
                                    }}
                                    disabled={item.disabled}
                                />
                                </FormControl>
                                <FormLabel className="font-normal">{item.label}</FormLabel>
                            </FormItem>
                            )}
                        />
                        ))}
                    </div>
                    </FormItem>
                )}
            />

            {returnedItems.length > 0 && <Separator />}

            <div className="space-y-4">
                {returnedItems.map(item => (
                    <FormField
                        key={`${item}-condition`}
                        control={form.control}
                        name={`${item}Condition` as 'trackerCondition' | 'relayCondition' | 'simCondition'}
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                                <FormLabel>Condition of Returned {hardwareItems.find(h => h.id === item)?.label}</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    className="flex space-x-4"
                                    >
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl>
                                        <RadioGroupItem value="working" />
                                        </FormControl>
                                        <FormLabel className="font-normal">Working (Restock)</FormLabel>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                        <FormControl>
                                        <RadioGroupItem value="faulty" />
                                        </FormControl>
                                        <FormLabel className="font-normal">Faulty/Lost (Do Not Restock)</FormLabel>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ))}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirm Unsubscription
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
