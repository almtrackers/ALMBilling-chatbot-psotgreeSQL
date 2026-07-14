
'use client';

import { useState, useMemo } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
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
} from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import type { SimCard } from '@/lib/types';
import { Combobox } from '@/components/ui/combobox';
import { Separator } from '@/components/ui/separator';
import { useDealers } from '@/hooks/use-dealers';
import { useInventory } from '@/hooks/use-inventory';
import { mutate } from 'swr';

const allocationItemSchema = z.object({
    inventoryItemId: z.string().min(1, "Item is required."),
    itemType: z.string(),
    availableStock: z.number(),
    quantity: z.number().min(1, "Quantity must be at least 1."),
    imeis: z.array(z.string()).optional(),
    sims: z.array(z.any()).optional(),
});

const formSchema = z.object({
  dealerId: z.string().min(1, 'Dealer is required.'),
  allocationItems: z.array(allocationItemSchema).min(1, "At least one item must be added."),
});

type AllocateStockFormProps = {
  setDialogOpen: (open: boolean) => void;
};

export default function AllocateStockForm({ setDialogOpen }: AllocateStockFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { dealers, isLoading: loadingDealers } = useDealers();
  const { inventoryItems, isLoading: loadingInventory } = useInventory();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dealerId: '',
      allocationItems: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "allocationItems",
  });

  const addAllocationItem = () => {
    append({ 
        inventoryItemId: '', 
        itemType: '', 
        availableStock: 0, 
        quantity: 1, 
        imeis: [], 
        sims: [] 
    });
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to allocate stock.' });
      return;
    }
    setIsSubmitting(true);
    
    try {
        const dealerName = dealers?.find(e => e.id === values.dealerId)?.name || 'Unknown Dealer';
        
        const payload = values.allocationItems.map(item => ({
            inventoryItemId: item.inventoryItemId,
            dealerId: values.dealerId,
            quantity: item.itemType === 'tracker' ? item.imeis?.length : (item.itemType === 'sim' ? item.sims?.length : item.quantity),
            allocatedImeis: item.imeis,
            allocatedSims: item.sims,
            allocatedBy: user.name
        }));

        const response = await axios.post('/api/stock-allocations', payload);

        if (response.data) {
            await addLog(
                `Allocated stock to ${dealerName}: ${values.allocationItems.length} items`,
                user.name,
                'create'
            );
            
            toast({ title: 'Stock Allocated', description: `Stock has been successfully allocated to ${dealerName}.` });
            mutate('/api/stock-allocations');
            mutate('/api/inventory');
            setDialogOpen(false);
        }
    } catch (error: any) {
        console.error("Allocation failed:", error);
        toast({
            variant: 'destructive',
            title: 'Allocation Failed',
            description: error.response?.data?.message || 'An unexpected error occurred.'
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  const isLoading = loadingDealers || loadingInventory;

  const centralStock = useMemo(() => {
    return (inventoryItems ?? [])
      .filter((item) => Number(item.quantity) > 0)
      .map((item) => {
        const imeis = Array.isArray(item.imeis)
          ? item.imeis
          : item.imeis
            ? JSON.parse(item.imeis as string)
            : [];
        const parsedSims = Array.isArray(item.sims)
          ? item.sims
          : item.sims
            ? JSON.parse(item.sims as string)
            : [];

        return {
          ...item,
          quantity: Number(item.quantity),
          imeis,
          sims: parsedSims.filter((sim: SimCard) => sim.status === 'available'),
        };
      });
  }, [inventoryItems]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="dealerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination Dealer</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingDealers}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dealer..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingDealers ? (
                     <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    dealers?.map((dealer) => (
                      <SelectItem key={dealer.id} value={dealer.id}>
                        {dealer.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Separator />

        <div>
            {fields.map((field, index) => {
                const selectedItemId = form.watch(`allocationItems.${index}.inventoryItemId`);
                const selectedItem = centralStock?.find(i => i.id === selectedItemId);
                
                // Update hidden fields when selectedItem changes
                if (selectedItem && selectedItem.type !== form.getValues(`allocationItems.${index}.itemType`)) {
                    form.setValue(`allocationItems.${index}.itemType`, selectedItem.type, { shouldValidate: true });
                }
                if (selectedItem && selectedItem.quantity !== form.getValues(`allocationItems.${index}.availableStock`)) {
                    form.setValue(`allocationItems.${index}.availableStock`, selectedItem.quantity, { shouldValidate: true });
                }

                return (
                    <div key={field.id} className="p-4 border rounded-lg space-y-4 relative mb-4">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="absolute top-2 right-2 h-6 w-6" 
                            onClick={() => remove(index)}
                        >
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>

                        <Controller
                            control={form.control}
                            name={`allocationItems.${index}.inventoryItemId`}
                            render={({ field: controllerField }) => (
                                <FormItem>
                                    <FormLabel>Inventory Item</FormLabel>
                                    <Select onValueChange={(value) => {
                                        controllerField.onChange(value);
                                        const item = centralStock?.find(i => i.id === value);
                                        form.setValue(`allocationItems.${index}.itemType`, item?.type || '', { shouldValidate: true });
                                        form.setValue(`allocationItems.${index}.availableStock`, item?.quantity || 0, { shouldValidate: true });
                                        form.setValue(`allocationItems.${index}.imeis`, []);
                                        form.setValue(`allocationItems.${index}.sims`, []);
                                    }} defaultValue={controllerField.value} disabled={loadingInventory}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select an item..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {loadingInventory ? (
                                                <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                                            ) : (
                                                centralStock?.map((item) => (
                                                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {selectedItem && <p className="text-sm text-muted-foreground pt-1">Central stock available: {selectedItem.quantity}</p>}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        
                        {selectedItem?.type === 'tracker' && (
                             <Controller
                                control={form.control}
                                name={`allocationItems.${index}.imeis`}
                                render={({ field: controllerField }) => (
                                <FormItem>
                                    <FormLabel>Select IMEIs ({controllerField.value?.length || 0} selected)</FormLabel>
                                    <Combobox
                                        options={(selectedItem.imeis || []).map(imei => ({ value: imei, label: imei }))}
                                        value={''} // Not used for multi-select
                                        onChange={(imei) => {
                                            const currentImeis = controllerField.value || [];
                                            const newImeis = currentImeis.includes(imei) ? currentImeis.filter(i => i !== imei) : [...currentImeis, imei];
                                            controllerField.onChange(newImeis);
                                        }}
                                        placeholder="Search and select multiple IMEIs..."
                                        searchPlaceholder='Search IMEIs...'
                                        noResultsMessage='No available IMEIs found.'
                                        isMultiSelect
                                        selectedValues={controllerField.value}
                                    />
                                </FormItem>
                                )}
                             />
                        )}

                        {selectedItem?.type === 'sim' && (
                             <Controller
                                control={form.control}
                                name={`allocationItems.${index}.sims`}
                                render={({ field: controllerField }) => (
                                <FormItem>
                                    <FormLabel>Select SIMs ({controllerField.value?.length || 0} selected)</FormLabel>
                                     <Combobox
                                        options={(selectedItem.sims || []).map(sim => ({ value: sim.simNumber, label: `${sim.simNumber} / ${sim.imsi}` }))}
                                        value={''} // Not used for multi-select
                                        onChange={(simNumber) => {
                                            const currentSims = controllerField.value || [];
                                            const sim = (selectedItem.sims || []).find(s => s.simNumber === simNumber);
                                            if (!sim) return;
                                            const newSims = currentSims.some(s => s.simNumber === simNumber) ? currentSims.filter(s => s.simNumber !== simNumber) : [...currentSims, sim];
                                            controllerField.onChange(newSims);
                                        }}
                                        placeholder="Search and select multiple SIMs..."
                                        searchPlaceholder='Search SIMs...'
                                        noResultsMessage='No available SIMs found.'
                                        isMultiSelect
                                        selectedValues={controllerField.value?.map(s => s.simNumber)}
                                    />
                                </FormItem>
                                )}
                            />
                        )}

                        {selectedItem && selectedItem.type !== 'tracker' && selectedItem.type !== 'sim' && (
                             <Controller
                                control={form.control}
                                name={`allocationItems.${index}.quantity`}
                                render={({ field: controllerField }) => (
                                    <FormItem>
                                        <FormLabel>Quantity</FormLabel>
                                        <FormControl>
                                            <Input type="number" min="1" max={selectedItem.quantity > 0 ? selectedItem.quantity : undefined} {...controllerField} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                             />
                        )}
                    </div>
                )
            })}
             <FormMessage>{form.formState.errors.allocationItems?.root?.message}</FormMessage>
        </div>

        <Button type="button" variant="outline" onClick={addAllocationItem} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Another Item
        </Button>
        
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting || isLoading}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Allocating...
              </>
            ) : (
              'Allocate All Items'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
