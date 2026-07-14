
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import useSWR from 'swr';
import axios from 'axios';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { InventoryItem, SimCard } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { useAuth as useTraccarAuth } from '@/contexts/auth-context';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { addLog } from '@/lib/log-service';
import QRCodeScanner from '@/components/ui/qr-code-scanner';

// Helper function to normalize Pakistani phone numbers
const normalizeSimNumber = (sim: string): string | null => {
    const cleaned = sim.replace(/\s+/g, ''); // Remove all whitespace
    if (cleaned.startsWith('+92')) {
        return '0' + cleaned.substring(3); // +923... -> 03...
    }
    if (cleaned.startsWith('92')) {
        return '0' + cleaned.substring(2); // 923... -> 03...
    }
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
        return '0' + cleaned; // 3... -> 03...
    }
    if (cleaned.length === 11 && cleaned.startsWith('03')) {
        return cleaned; // Already in correct format
    }
    return null; // Invalid format
};

const formSchema = z.object({
  name: z.string().min(1, 'Item name is required.'),
  type: z.enum([
    'tracker',
    'relay',
    'sim',
    'wire_plug_harness',
    'mic',
    'sos_button',
    'other',
  ]),
  quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative.'),
  cost: z.coerce.number().min(0).optional(),
  supplier: z.string().optional(),
  includeHarness: z.boolean().default(true),
  includeMic: z.boolean().default(false),
  includeSos: z.boolean().default(false),
  includeRelay: z.boolean().default(true),
  imeis: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true; // Allow empty string
        const imeis = val.split('\n').map(imei => imei.replace(/\s/g, ''));
        return imeis.every(
          (imei) => imei.trim() === '' || /^\d+$/.test(imei.trim())
        );
      },
      {
        message: 'IMEIs must only contain numbers.',
      }
    )
    .refine(
      (val) => {
        if (!val) return true; // Allow empty string
        const imeis = val.split('\n').map(imei => imei.replace(/\s/g, '').trim());
        return imeis.every(
          (imei) => {
            if (imei === '') return true;
            if (imei.startsWith('019')) return true; // Skip length validation for these
            return imei.length === 15;
          }
        );
      },
      {
        message: 'All IMEIs must be 15 digits long (unless starting with 019).',
      }
    ),
    simNumbers: z
    .string()
    .optional()
    .transform((val) => val ? val.split('\n').map(line => line.trim()).map(normalizeSimNumber).filter(Boolean).join('\n') : val)
    .refine(
      (val) => {
        if (!val) return true;
        // After transform, all numbers should be in valid format or filtered out.
        // We just need to check if the string is non-empty.
        return val.split('\n').filter(Boolean).length > 0 || val === '';
      },
      {
        message: 'One or more SIM numbers are in an invalid format. Valid formats: 03..., 3..., 92..., +92...',
      }
    ),
    imsis: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const imsis = val.split('\n').map(imsi => imsi.replace(/\s/g, ''));
        return imsis.every(
          (imsi) => imsi.trim() === '' || /^\d+$/.test(imsi.trim())
        );
      },
      {
        message: 'IMSIs must only contain digits.',
      }
    )
    .refine(
      (val) => {
        if (!val) return true;
        const imsis = val.split('\n').map(imsi => imsi.replace(/\s/g, ''));
        return imsis.every(
          (imsi) => imsi.trim() === '' || imsi.trim().length === 4
        );
      },
      {
        message: 'All IMSIs must be 4 digits long.',
      }
    ),
}).refine(data => {
    if (data.type === 'sim') {
        const simLines = data.simNumbers?.split('\n').filter(line => line.trim() !== '').length || 0;
        const imsiLines = data.imsis?.split('\n').filter(line => line.trim() !== '').length || 0;
        return simLines === imsiLines;
    }
    return true;
}, {
    message: "The number of SIM Numbers must match the number of IMSIs.",
    path: ['imsis'],
});

type AddInventoryItemFormProps = {
  setDialogOpen: (open: boolean) => void;
  itemToEdit?: InventoryItem;
};

export default function AddInventoryItemForm({
  setDialogOpen,
  itemToEdit,
}: AddInventoryItemFormProps) {
  const { user } = useTraccarAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!itemToEdit;

  const fetcher = (url: string) => axios.get(url).then(res => res.data);
  const { data: inventoryItems } = useSWR<InventoryItem[]>('/api/inventory', fetcher);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      type: 'tracker',
      quantity: 0,
      cost: 0,
      supplier: '',
      includeHarness: true,
      includeMic: false,
      includeSos: false,
      includeRelay: true,
      imeis: '',
      simNumbers: '',
      imsis: '',
    },
  });

  const selectedType = form.watch('type');
  const imeiString = form.watch('imeis');
  const simString = form.watch('simNumbers');
  const imsiString = form.watch('imsis');

  useEffect(() => {
    if (isEditMode && itemToEdit) {
      form.reset({
        name: itemToEdit.name,
        type: itemToEdit.type,
        quantity: itemToEdit.quantity,
        cost: itemToEdit.cost || 0,
        supplier: itemToEdit.supplier || '',
        imeis: itemToEdit.imeis?.join('\n') || '',
        simNumbers: itemToEdit.sims?.map(s => s.simNumber).join('\n') || '',
        imsis: itemToEdit.sims?.map(s => s.imsi).join('\n') || '',
      });
    }
  }, [isEditMode, itemToEdit, form]);

  // Helper to clean and split multiline input
  const cleanAndSplit = (input: string | undefined) => {
    if (!input) return [];
    return input.split('\n')
      .map(line => line.replace(/\s/g, '')) // Remove all whitespace
      .filter(line => line.length > 0); // Filter out empty lines
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to modify inventory.',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      let quantity = values.quantity;
      const mainItemData: any = {
        name: values.name,
        type: values.type,
        cost: values.cost,
        supplier: values.supplier,
        createdBy: user.name,
      };

      if (values.type === 'tracker') {
        const imeiListRaw = cleanAndSplit(values.imeis);
        
        if (!isEditMode) {
            const imeiListUnique = [...new Set(imeiListRaw)];
            if (imeiListRaw.length > imeiListUnique.length) {
                toast({
                    title: "Filtered Duplicate IMEIs",
                    description: `Duplicate IMEIs in your input were automatically filtered.`,
                });
            }
            const allExistingImeis = new Set(
                inventoryItems?.filter((item) => item.type === 'tracker').flatMap((item) => item.imeis || [])
            );
            const duplicatesInStock = imeiListUnique.filter((imei) => allExistingImeis.has(imei));

            if (duplicatesInStock.length > 0) {
                toast({
                    variant: 'destructive',
                    title: 'Duplicate IMEIs Found',
                    description: `The following IMEI(s) already exist in your inventory: ${duplicatesInStock.join(', ')}`,
                    duration: 10000,
                });
                setIsSubmitting(false);
                return;
            }
            mainItemData.imeis = imeiListUnique;
            mainItemData.quantity = imeiListUnique.length;
        } else {
            // In edit mode, we don't change IMEIs
            mainItemData.imeis = itemToEdit?.imeis || [];
            mainItemData.quantity = itemToEdit?.quantity || 0;
        }
        quantity = mainItemData.quantity;

      } else if (values.type === 'sim') {
        const simListRaw = cleanAndSplit(values.simNumbers);
        const imsiListRaw = cleanAndSplit(values.imsis);

        if (!isEditMode) {
            const simListUnique = [...new Set(simListRaw)];
            const imsiListUnique = [...new Set(imsiListRaw)];
             if (simListRaw.length > simListUnique.length || imsiListRaw.length > imsiListUnique.length) {
                toast({ title: "Filtered Duplicate Entries", description: `Duplicate SIMs or IMSIs were automatically filtered.` });
            }

            const allExistingSims = new Set(inventoryItems?.filter(i => i.type === 'sim').flatMap(i => i.sims?.map(s => s.simNumber) || []));
            const allExistingImsis = new Set(inventoryItems?.filter(i => i.type === 'sim').flatMap(i => i.sims?.map(s => s.imsi) || []));

            const newSimData: SimCard[] = simListUnique.map((simNumber, index) => ({ simNumber, imsi: imsiListUnique[index] }));
            
            const duplicateSimsInStock = newSimData.filter(s => allExistingSims.has(s.simNumber));
            if (duplicateSimsInStock.length > 0) {
                toast({ variant: 'destructive', title: 'Duplicate SIMs Found', description: `SIMs already in stock: ${duplicateSimsInStock.map(s => s.simNumber).join(', ')}` });
                setIsSubmitting(false); return;
            }
            const duplicateImsisInStock = newSimData.filter(s => allExistingImsis.has(s.imsi));
            if (duplicateImsisInStock.length > 0) {
                toast({ variant: 'destructive', title: 'Duplicate IMSIs Found', description: `IMSIs already in stock: ${duplicateImsisInStock.map(s => s.imsi).join(', ')}` });
                setIsSubmitting(false); return;
            }

            mainItemData.sims = newSimData;
            mainItemData.quantity = newSimData.length;
        } else {
             mainItemData.sims = itemToEdit?.sims || [];
             mainItemData.quantity = itemToEdit?.quantity || 0;
        }
        quantity = mainItemData.quantity;
      } else {
         if (quantity < 1 && !isEditMode) {
          toast({
            variant: 'destructive',
            title: 'Quantity Required',
            description: 'Please enter a quantity of at least 1.',
          });
          setIsSubmitting(false);
          return;
        }
        mainItemData.quantity = quantity;
      }

      if (isEditMode && itemToEdit) {
        await axios.put('/api/inventory', {
          id: itemToEdit.id,
          name: values.name,
          supplier: values.supplier,
          cost: values.cost,
        });
        await addLog(`Updated inventory item: "${values.name}" (ID: ${itemToEdit.id})`, user.name, 'update');
        toast({
          title: 'Item Updated',
          description: `${values.name} has been updated successfully.`,
        });
      } else {
        if(quantity === 0) {
            toast({
                variant: 'destructive',
                title: 'No Items to Add',
                description: 'Please provide at least one valid IMEI or SIM card to add.',
            });
            setIsSubmitting(false);
            return;
        }

        const payload = {
          ...mainItemData,
          includeHarness: values.includeHarness,
          includeRelay: values.includeRelay,
          includeMic: values.includeMic,
          includeSos: values.includeSos,
        };

        await axios.post('/api/inventory', payload);
        await addLog(`Added ${quantity} x ${values.name} to inventory`, user.name, 'create');

        toast({
          title: 'Inventory Updated',
          description: `Items added to records.`,
        });
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: isEditMode ? 'Failed to update item' : 'Failed to add item',
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedQuantity = () => {
      if (selectedType === 'tracker') {
        return cleanAndSplit(imeiString).length || 0;
      }
      if (selectedType === 'sim') {
        return cleanAndSplit(simString).length || 0;
      }
      return form.getValues('quantity');
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item Type</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={isEditMode}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an item type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="tracker">Tracker</SelectItem>
                  <SelectItem value="sim">SIM Card</SelectItem>
                  <SelectItem value="relay">Relay</SelectItem>
                  <SelectItem value="wire_plug_harness">
                    Wire/Plug Harness
                  </SelectItem>
                  <SelectItem value="mic">Microphone</SelectItem>
                  <SelectItem value="sos_button">SOS Button</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item Name / Model</FormLabel>
              <FormControl>
                <Input placeholder="e.g., GT06 Tracker or Jazz SIM" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedType === 'tracker' ? (
          <FormField
            control={form.control}
            name="imeis"
            render={({ field }) => (
              <FormItem>
                <div className="flex justify-between items-center">
                  <FormLabel>IMEI Numbers</FormLabel>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Quantity: {calculatedQuantity()}
                    </span>
                     <QRCodeScanner 
                        buttonText="Scan IMEI"
                        onScan={(result) => {
                            const currentImeis = form.getValues('imeis') || '';
                            const newImeis = currentImeis ? `${currentImeis}\n${result}` : result;
                            form.setValue('imeis', newImeis);
                        }}
                        className="h-8"
                        keepOpenOnScan={true}
                    />
                  </div>
                </div>
                <FormControl>
                  <Textarea
                    placeholder="Enter one IMEI per line..."
                    className="h-24"
                    {...field}
                    disabled={isEditMode}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : selectedType === 'sim' ? (
             <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <FormLabel>SIM Details</FormLabel>
                  <span className="text-xs text-muted-foreground">
                    Quantity: {calculatedQuantity()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="simNumbers"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>SIM Numbers</FormLabel>
                        <FormControl>
                        <Textarea
                            placeholder="One per line... Format will be auto-corrected."
                            className="h-24"
                            {...field}
                            disabled={isEditMode}
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="imsis"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>IMSIs (4 digits)</FormLabel>
                        <FormControl>
                        <Textarea
                            placeholder="Must match SIMs... (4 digits only)"
                            className="h-24"
                            {...field}
                            disabled={isEditMode}
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                </div>
             </div>
        ) : (
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity</FormLabel>
                <FormControl>
                  <Input type="number" {...field} disabled={isEditMode} min="0" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit Cost (PKR)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="3500" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="supplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supplier</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Local Vendor" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {selectedType === 'tracker' && !isEditMode && (
          <div className="space-y-4 rounded-md border p-4">
            <h4 className="text-sm font-medium">Bundle Accessories</h4>
            <p className="text-xs text-muted-foreground">
              These items will be added to inventory with the same quantity as
              trackers.
            </p>
            <Separator />
            <FormField
              control={form.control}
              name="includeHarness"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal leading-none">
                    Include Wire/Plug Harness
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="includeRelay"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal leading-none">
                    Include Relay
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="includeMic"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal leading-none">
                    Include Microphone
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="includeSos"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal leading-none">
                    Include SOS Button
                  </FormLabel>
                </FormItem>
              )}
            />
          </div>
        )}

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
              'Add to Stock'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
