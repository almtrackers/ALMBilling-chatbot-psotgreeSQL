'use client';

import { useState, useMemo } from 'react';
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
  FormDescription,
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
import { useAuth } from '@/contexts/auth-context';
import axios from 'axios';
import { Separator } from '@/components/ui/separator';
import { addLog } from '@/lib/log-service';
import { useInventory } from '@/hooks/use-inventory';
import type { UnbilledDevice } from '@/hooks/use-billing-status';
import { Input } from '@/components/ui/input';
import type { InventoryItem, SimCard } from '@/lib/types';
import { Combobox } from '@/components/ui/combobox';
import { getTraccarDeviceEvents } from '@/lib/api';
import { useDevices } from '@/hooks/use-devices';
import SendCommandDialog from '../devices/SendCommandDialog';
import { mutate } from 'swr';


const formSchema = z.object({
  trackerId: z.string().min(1, 'Tracker model is required.'),
  simId: z.string().min(1, 'A SIM card model must be selected.'),
  simIdentifier: z.string().min(1, 'A SIM (by IMSI) must be selected.'),
  // Fields for new tracker model
  newModelName: z.string().optional(),
  unitCost: z.coerce.number().min(0).optional(),
  supplier: z.string().optional(),
  harnessId: z.string().min(1, 'Wire harness is required.'),
  relayId: z.string().optional(),
  micId: z.string().optional(),
  sosButtonId: z.string().optional(),
}).refine(data => {
    if (data.trackerId === 'new_tracker') {
        return data.newModelName && data.newModelName.length > 0;
    }
    return true;
}, {
    message: "New model name is required.",
    path: ['newModelName']
});


type QuickAddStockFormProps = {
  device: UnbilledDevice;
  setDialogOpen: (open: boolean) => void;
};

export default function QuickAddStockForm({ device, setDialogOpen }: QuickAddStockFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { inventoryItems, isLoading: isLoadingStock, mutate } = useInventory();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      trackerId: device.trackerId || '',
      simId: '',
      simIdentifier: '',
      newModelName: '',
      unitCost: 0,
      supplier: '',
      harnessId: '',
      relayId: '',
      micId: '',
      sosButtonId: '',
    },
  });
  
  const selectedTrackerId = form.watch('trackerId');
  const selectedSimId = form.watch('simId');

  const selectedSim = useMemo(() => {
    if (!selectedSimId || !form.watch('simIdentifier')) return null;
    const simItem = inventoryItems?.find(item => item.id === selectedSimId);
    if (!simItem?.sims) return null;
    const sims = typeof simItem.sims === 'string' ? JSON.parse(simItem.sims) : simItem.sims;
    return sims.find((s: any) => s.imsi === form.watch('simIdentifier')) || null;
  }, [inventoryItems, selectedSimId, form.watch('simIdentifier')]);

  const getItemsByType = (type: string) => {
    return inventoryItems?.filter(item => item.type === type) || [];
  };

  const getAvailableSims = () => {
    if (!selectedSimId) return [];
    const simItem = inventoryItems?.find(item => item.id === selectedSimId);
    if (!simItem?.sims) return [];
    const sims = typeof simItem.sims === 'string' ? JSON.parse(simItem.sims) : simItem.sims;
    return sims.map((s: any) => ({
      label: `${s.simNumber} (${s.imsi})`,
      value: s.imsi
    }));
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in.' });
      return;
    }
    
    setIsSubmitting(true);
    try {
        const trackerName = values.trackerId === 'new_tracker' 
            ? values.newModelName 
            : inventoryItems?.find(i => i.id === values.trackerId)?.name || 'Unknown Tracker';

        const payload = {
            ...values,
            imei: device.uniqueId,
            adminName: user.name
        };

        const response = await axios.post('/api/inventory/quick-add', payload);

        if (response.data.success) {
            await addLog(
                `Added ${trackerName} (IMEI: ${device.uniqueId}) via Quick Add`,
                user.name,
                'create'
            );
            
            toast({ title: 'Stock Added', description: `${device.name} has been successfully added to your inventory.` });
            mutate();
            setDialogOpen(false);
        } else {
            throw new Error(response.data.message || 'Failed to add stock');
        }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to Add Stock', description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        
        <Separator />
        <h4 className="text-sm font-medium text-muted-foreground">Device Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
                <p className="text-xs font-semibold">Vehicle</p>
                <p className="text-sm">{device.name}</p>
            </div>
             <div className="space-y-1">
                <p className="text-xs font-semibold">IMEI</p>
                <p className="text-sm font-mono">{device.uniqueId}</p>
            </div>
        </div>
        
        <Separator />
        <h4 className="text-sm font-medium text-muted-foreground">Select Inventory Items to Add</h4>
        <div className="space-y-4">
            <FormField
                control={form.control} name="trackerId"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Tracker Model</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingStock}>
                    <FormControl>
                        <SelectTrigger><SelectValue placeholder={isLoadingStock ? "Loading..." : `Select a tracker model...`} /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        <SelectItem value="new_tracker">-- Add New Tracker Model --</SelectItem>
                        {getItemsByType('tracker').map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
                )}
            />

            {selectedTrackerId === 'new_tracker' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-lg">
                     <FormField
                        control={form.control} name="newModelName"
                        render={({ field }) => (
                            <FormItem className="md:col-span-3">
                                <FormLabel>New Model Name</FormLabel>
                                <FormControl><Input placeholder="e.g., BT-900 Advanced" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control} name="unitCost"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Unit Cost (PKR)</FormLabel>
                                <FormControl><Input type="number" placeholder="3500" {...field} /></FormControl>
                                <FormDescription className="text-xs">Creates an expense entry.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control} name="supplier"
                        render={({ field }) => (
                            <FormItem className="md:col-span-2">
                                <FormLabel>Supplier</FormLabel>
                                <FormControl><Input placeholder="e.g., Local Vendor" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}

            <div className="space-y-2">
                <FormField
                    control={form.control} name="simId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>SIM Card Model</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingStock}>
                            <FormControl>
                                <SelectTrigger><SelectValue placeholder={isLoadingStock ? "Loading..." : "Select SIM model..."} /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {getItemsByType('sim').map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {traccarDeviceDetails?.status === 'online' && (
                   <SendCommandDialog deviceId={device.id} onCommandSent={handleImsiFetch} />
                )}
            </div>

            <FormField control={form.control} name="simIdentifier" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>SIM (Number or IMSI)</FormLabel><Combobox options={getAvailableSims()} value={field.value} onChange={field.onChange} placeholder={!selectedSimId ? "Select SIM model first" : "Select SIM..."} searchPlaceholder="Search..." noResultsMessage="No SIMs found." disabled={!selectedSimId} /><FormMessage /></FormItem>)} />
            
            <Separator />
            <h4 className="text-sm font-medium text-muted-foreground">Accessories</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="harnessId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wire Harness (Required)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select wire harness..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getItemsByType('wire_plug_harness').map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="relayId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relay (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select relay (if any)..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getItemsByType('relay').map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="micId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mic (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select mic (if any)..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getItemsByType('mic').map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sosButtonId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SOS Button (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select SOS button (if any)..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getItemsByType('sos_button').map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
        </div>
        
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting || isLoadingStock}>
            {isSubmitting ? ( <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</> ) : 'Add to Inventory' }
          </Button>
        </div>
      </form>
    </Form>
  );
}
