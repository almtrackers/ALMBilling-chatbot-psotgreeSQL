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
import type { Sale, CompanyVehicle, InventoryItem, SimCard, Device } from '@/lib/types';
import { addLog } from '@/lib/log-service';
import { useSales } from '@/hooks/use-sales';
import { useCompanyVehicles } from '@/hooks/use-company-vehicles';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Replace, Wand2 } from 'lucide-react';
import { useDevices } from '@/hooks/use-devices';
import { apiClient, localApiClient } from '@/lib/api';
import { useAvailableStock } from '@/hooks/use-available-stock';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import SendCommandDialog from '../devices/SendCommandDialog';
import { getTraccarDeviceEvents } from '@/lib/api';
import QRCodeScanner from '@/components/ui/qr-code-scanner';


const formSchema = z.object({
    replacementType: z.enum(['tracker', 'sim'], { required_error: "Please select what you are replacing." }),
    reason: z.string().min(1, "Reason for replacement is required."),
    // Tracker fields
    newTrackerId: z.string().optional(),
    newImei: z.string().optional(),
    oldTrackerCondition: z.enum(['working', 'faulty']).optional(),
    // SIM fields
    newSimId: z.string().optional(),
    newSimIdentifier: z.string().optional(),
    oldSimCondition: z.enum(['working', 'faulty']).optional(),
}).refine(data => {
    if (data.replacementType === 'tracker') {
        return data.newTrackerId && data.newImei;
    }
    return true;
}, { message: "New tracker and IMEI must be selected.", path: ['newImei']})
.refine(data => {
    if (data.replacementType === 'sim') {
        return data.newSimId && data.newSimIdentifier;
    }
    return true;
}, { message: "New SIM model and number must be selected.", path: ['newSimIdentifier']});


type ReplaceHardwareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale?: Sale | null;
  companyVehicle?: CompanyVehicle | null;
};

export default function ReplaceHardwareDialog({ open, onOpenChange, sale, companyVehicle }: ReplaceHardwareDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate: mutateSales } = useSales();
  const { mutate: mutateVehicles } = useCompanyVehicles();
  const { devices, mutate: mutateDevices } = useDevices();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCommandDialogOpen, setIsCommandDialogOpen] = useState(false);
  const { availableStock, isLoading: isLoadingStock } = useAvailableStock();

  // Determine which record we're working with
  const record = sale || companyVehicle;
  const isCompanyVehicle = !!companyVehicle;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: '',
      oldTrackerCondition: 'faulty',
      oldSimCondition: 'faulty',
    },
  });

  const replacementType = form.watch('replacementType');
  const newTrackerId = form.watch('newTrackerId');
  const newSimId = form.watch('newSimId');

  const getAvailableItems = (type: 'tracker' | 'sim') => {
      return availableStock?.filter(item => item.type === type) || [];
  }

  const getImeiOptions = () => {
      if (!newTrackerId) return [];
      const tracker = availableStock.find(i => i.id === newTrackerId);
      return tracker?.imeis?.map(imei => ({ value: imei, label: imei })) || [];
  }
  
  const getSimOptions = () => {
      if (!newSimId) return [];
      const simItem = availableStock.find(i => i.id === newSimId);
      return simItem?.sims?.map(sim => ({ value: sim.imsi, label: `${sim.simNumber} / ${sim.imsi}` })) || [];
  }

  const handleTrackerScan = (scanned: string) => {
    // Try to locate tracker and IMEI in available stock
    for (const item of availableStock) {
      if (item.type === 'tracker' && item.imeis?.includes(scanned)) {
        form.setValue('newTrackerId', item.id, { shouldValidate: true });
        form.setValue('newImei', scanned, { shouldValidate: true });
        toast({
          title: 'Tracker Selected',
          description: `Matched IMEI ${scanned} in model ${item.name}.`,
        });
        return;
      }
    }
    toast({
      variant: 'destructive',
      title: 'IMEI Not Found in Stock',
      description: `Scanned IMEI ${scanned} was not found in available tracker stock.`,
    });
  };

  const handleSimScan = (scanned: string) => {
    // Try to locate SIM in available stock by SIM number or IMSI
    for (const item of availableStock) {
      if (item.type === 'sim' && item.sims) {
        const found = item.sims.find(
          (s) => s.imsi === scanned || s.simNumber === scanned
        );
        if (found) {
          form.setValue('newSimId', item.id, { shouldValidate: true });
          form.setValue('newSimIdentifier', found.imsi, { shouldValidate: true });
          toast({
            title: 'SIM Selected',
            description: `Matched SIM ${found.simNumber} / ${found.imsi} in model ${item.name}.`,
          });
          return;
        }
      }
    }
    toast({
      variant: 'destructive',
      title: 'SIM Not Found in Stock',
      description: `Scanned value "${scanned}" was not found in available SIM stock.`,
    });
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user || !record) {
      toast({ variant: 'destructive', title: 'Error', description: 'Required data is missing.' });
      return;
    }
    
    const deviceOnServer = devices?.find(d => d.uniqueId === record?.imei);
    if (!deviceOnServer) {
        toast({ variant: 'destructive', title: 'Device Not Found', description: 'The device associated with this record could not be found on the server.' });
        return;
    }

    setIsSubmitting(true);
    
    try {
        let updatePayload: any = {};
        let deviceUpdate: Partial<Device> = {};
        let logMessage = '';

        if (values.replacementType === 'tracker' && values.newImei && values.newTrackerId) {
            updatePayload = {
                imei: values.newImei,
                trackerId: values.newTrackerId,
            };
            deviceUpdate = {
                uniqueId: values.newImei,
            };
            logMessage = `Replaced tracker for ${record?.vehicleNumber}. Old IMEI: ${record?.imei}, New IMEI: ${values.newImei}. Reason: ${values.reason}`;

            // Handle old tracker restock
            if (values.oldTrackerCondition === 'working' && record?.trackerId && record?.imei) {
                await fetch('/api/inventory/restock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'tracker',
                        itemId: record.trackerId,
                        imei: record.imei,
                    }),
                });
            }

        } else if (values.replacementType === 'sim' && values.newSimId && values.newSimIdentifier) {
            const simItem = availableStock.find(i => i.id === values.newSimId);
            const newSim = simItem?.sims?.find(s => s.imsi === values.newSimIdentifier);

            if (!newSim) {
                throw new Error("Selected new SIM not found in stock.");
            }

            updatePayload = {
                simId: values.newSimId,
                simNumber: newSim.simNumber,
                imsi: newSim.imsi,
            };
            logMessage = `Replaced SIM for ${record?.vehicleNumber}. Old SIM: ${record?.simNumber}, New SIM: ${newSim.simNumber}. Reason: ${values.reason}`;

             if (values.oldSimCondition === 'working' && record?.simId && record?.simNumber && record?.imsi) {
                await fetch('/api/inventory/restock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'sim',
                        itemId: record.simId,
                        sim: {
                            simNumber: record.simNumber,
                            imsi: record.imsi,
                        },
                    }),
                });
            }

        } else {
            throw new Error("Invalid replacement data provided.");
        }

        // 1. Update device on Traccar (only for tracker replacement)
        if (values.replacementType === 'tracker') {
          await apiClient.put(`/devices/${deviceOnServer.id}`, { ...deviceOnServer, ...deviceUpdate });
        }
        
        // 2. Update record via Prisma API
        const endpoint = isCompanyVehicle ? `/api/company-vehicles/${record.id}` : `/api/sales/${record.id}`;
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        // 3. Log the action
        await addLog(logMessage, user.name, 'update');
        
        // 4. Update UI
        if (isCompanyVehicle) {
          mutateVehicles();
        } else {
          mutateSales();
        }
        mutateDevices();

        toast({ title: 'Hardware Replaced', description: `The hardware for ${record?.vehicleNumber} has been successfully updated.` });
        onOpenChange(false);
        form.reset();

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Replacement Failed',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImsiFetch = async () => {
    if (!record) return;

    const deviceOnServer = devices?.find(d => d.uniqueId === record?.imei);
    if (!deviceOnServer) {
      toast({ variant: 'destructive', title: 'Device Not Found', description: 'The device associated with this record could not be found on the server.' });
      return;
    }

    setIsCommandDialogOpen(false);
    toast({ title: "Processing Command...", description: "Waiting for device to respond. This may take a moment." });

    try {
      await new Promise(resolve => setTimeout(resolve, 8000));

      const events = await getTraccarDeviceEvents(deviceOnServer.id);
      const commandResultEvent = events.find(e => e.type === 'commandResult');

      if (!commandResultEvent || !commandResultEvent.attributes.result) {
        throw new Error("No command result received from the device. It might be offline or not responding.");
      }

      const resultText = commandResultEvent.attributes.result as string;
      toast({ title: "Command Result", description: `Device responded: "${resultText}"` });
      const imsiMatch = resultText.match(/IMSI:(\d+)/);

      if (!imsiMatch || !imsiMatch[1]) {
        throw new Error(`Could not find IMSI in the device's response.`);
      }

      const fullImsi = imsiMatch[1];
      const last4Digits = fullImsi.slice(-4);

      // Auto-select SIM from stock based on IMSI
      for (const item of availableStock) {
        if (item.type === 'sim' && item.sims) {
          const foundSim = item.sims.find(s => s.imsi.endsWith(last4Digits));
          if (foundSim) {
            form.setValue('newSimId', item.id, { shouldValidate: true });
            setTimeout(() => {
              form.setValue('newSimIdentifier', foundSim.imsi, { shouldValidate: true });
              toast({ title: "SIM Auto-Selected", description: `Selected ${foundSim.simNumber} from inventory based on device IMSI.` });
            }, 100);
            return;
          }
        }
      }

      throw new Error(`A SIM with IMSI ending in ${last4Digits} was not found in your available stock.`);

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'IMSI Fetch Failed',
        description: error.message || 'Failed to fetch IMSI from device.',
      });
    }
  };
  
  if(!record) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if(!o) form.reset(); }}>
      <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Replace Hardware for {record?.vehicleNumber}</DialogTitle>
            <DialogDescription>
              Select the hardware to replace and choose a new unit from your available stock.
            </DialogDescription>
          </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <FormField
              control={form.control}
              name="replacementType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>What are you replacing?</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl><RadioGroupItem value="tracker" /></FormControl>
                        <FormLabel className="font-normal">Tracker</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl><RadioGroupItem value="sim" /></FormControl>
                        <FormLabel className="font-normal">SIM Card</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {replacementType === 'tracker' && (
                <div className="space-y-4 p-4 border rounded-lg">
                     <p className="text-sm font-medium">Current Tracker: <span className="font-mono text-muted-foreground">{record?.imei}</span></p>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control} name="newTrackerId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New Tracker Model</FormLabel>
                                    <Select onValueChange={(value) => { field.onChange(value); form.setValue('newImei', ''); }} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select model..." /></SelectTrigger></FormControl>
                                    <SelectContent>{getAvailableItems('tracker').map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control} name="newImei"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New IMEI</FormLabel>
                                    <div className="flex gap-2">
                                      <div className="flex-1">
                                        <Combobox
                                          options={getImeiOptions()}
                                          value={field.value || ''}
                                          onChange={field.onChange}
                                          placeholder={
                                            !newTrackerId
                                              ? 'Select model first'
                                              : 'Select IMEI...'
                                          }
                                          searchPlaceholder="Search IMEI..."
                                          noResultsMessage="No IMEIs found."
                                          disabled={!newTrackerId}
                                        />
                                      </div>
                                      <QRCodeScanner
                                        onScan={handleTrackerScan}
                                        buttonText=""
                                        className="h-9 w-9"
                                      />
                                    </div>
                                </FormItem>
                            )}
                        />
                    </div>
                     <FormField
                        control={form.control} name="oldTrackerCondition"
                        render={({ field }) => (<FormItem><FormLabel>Old Tracker Condition</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="faulty" /></FormControl><FormLabel className="font-normal">Faulty/Lost</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="working" /></FormControl><FormLabel className="font-normal">Working (Restock)</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)}
                    />
                </div>
            )}
            
             {replacementType === 'sim' && (
                <div className="space-y-4 p-4 border rounded-lg">
                     <p className="text-sm font-medium">Current SIM: <span className="font-mono text-muted-foreground">{record?.simNumber} / {record?.imsi}</span></p>
                     <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control} name="newSimId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New SIM Model</FormLabel>
                                    <Select onValueChange={(value) => { field.onChange(value); form.setValue('newSimIdentifier', ''); }} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select model..." /></SelectTrigger></FormControl>
                                    <SelectContent>{getAvailableItems('sim').map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control} name="newSimIdentifier"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New SIM (by IMSI)</FormLabel>
                                    <div className="flex gap-2">
                                      <div className="flex-1">
                                        <Combobox
                                          options={getSimOptions()}
                                          value={field.value || ''}
                                          onChange={field.onChange}
                                          placeholder={
                                            !newSimId ? 'Select model first' : 'Select SIM...'
                                          }
                                          searchPlaceholder="Search SIM..."
                                          noResultsMessage="No SIMs found."
                                          disabled={!newSimId}
                                        />
                                      </div>
                                      <QRCodeScanner
                                        onScan={handleSimScan}
                                        buttonText=""
                                        className="h-9 w-9"
                                      />
                                    </div>
                                </FormItem>
                            )}
                        />
                    </div>
                    {(() => {
                      const deviceOnServer = devices?.find(d => d.uniqueId === record?.imei);
                      return deviceOnServer?.status === 'online' && (
                        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setIsCommandDialogOpen(true)}>
                          <Wand2 className="mr-2" />
                          Fetch IMSI from Device
                        </Button>
                      );
                    })()}
                     <FormField
                        control={form.control} name="oldSimCondition"
                        render={({ field }) => (<FormItem><FormLabel>Old SIM Condition</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="faulty" /></FormControl><FormLabel className="font-normal">Faulty/Lost</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="working" /></FormControl><FormLabel className="font-normal">Working (Restock)</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)}
                    />
                </div>
            )}
            
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Replacement</FormLabel>
                  <FormControl>
                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a reason..." /></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value="Faulty Hardware">Faulty Hardware</SelectItem>
                            <SelectItem value="Lost/Stolen">Lost/Stolen</SelectItem>
                            <SelectItem value="Customer Request/Upgrade">Customer Request/Upgrade</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || isLoadingStock}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Replace className="mr-2 h-4 w-4"/>}
                Confirm Replacement
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {(() => {
        const deviceOnServer = devices?.find(d => d.uniqueId === record?.imei);
        return deviceOnServer && (
          <SendCommandDialog
            deviceId={deviceOnServer.id}
            onCommandSent={handleImsiFetch}
            open={isCommandDialogOpen}
            onOpenChange={setIsCommandDialogOpen}
          />
        );
      })()}
    </Dialog>
  );
}
