
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
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DocumentUploadField } from '@/components/ui/document-upload-field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, addYears, addMonths, subYears, subMonths, parseISO, differenceInDays, endOfMonth, endOfYear, startOfMonth, startOfYear } from 'date-fns';
import { CalendarIcon, Loader2, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import type { InventoryItem, Sale, AppSettings, SimCard, CompanyVehicle, Dealer, TraccarUser, Device, Notification } from '@/lib/types';
import { Combobox } from '@/components/ui/combobox';
import { apiClient, localApiClient, getTraccarDeviceEvents } from '@/lib/api';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { addLog } from '@/lib/log-service';
import { useAvailableStock } from '@/hooks/use-available-stock';
import type { UnbilledDevice } from '@/hooks/use-billing-status';
import { useDevices } from '@/hooks/use-devices';
import SendCommandDialog from '../devices/SendCommandDialog';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { useDealers } from '@/hooks/use-dealers';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useNotifications } from '@/hooks/use-notifications';
import { useInventory } from '@/hooks/use-inventory';
import useSWR from 'swr';
import axios from 'axios';

const fetcher = (url: string) => localApiClient.get(url).then(res => res.data);
const traccarFetcher = (url: string) => apiClient.get(url).then(res => res.data);

const normalizePhoneNumber = (phone: string): string | null => {
    const cleaned = phone.replace(/\s+/g, '');
    if (cleaned.startsWith('+92')) {
        return '0' + cleaned.substring(3);
    }
    if (cleaned.startsWith('92')) {
        return '0' + cleaned.substring(2);
    }
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
        return '0' + cleaned;
    }
    if (cleaned.length === 11 && cleaned.startsWith('03')) {
        return cleaned;
    }
    return null;
}

const normalizeMultiplePhoneNumbers = (phones: string): string | null => {
    // Split by comma and process each number
    const numbers = phones.split(',').map(num => num.trim()).filter(num => num.length > 0);
    
    if (numbers.length === 0) return null;
    
    const normalized = numbers.map(num => normalizePhoneNumber(num)).filter(Boolean);
    
    if (normalized.length === 0 || normalized.length !== numbers.length) {
        return null; // Some numbers failed to normalize
    }
    
    return normalized.join(',');
}

const formSchema = z.object({
  userIdOrName: z.string().min(1, 'Customer Name is required.'),
  devicePrice: z.coerce.number().min(0, 'Device price must be a positive number.'),
  amount: z.coerce.number().min(0, 'Amount must be a positive number.'),
  date: z.date(),
  vehicleNumber: z.string().min(1, "Vehicle number is required"),
  trackerId: z.string(), // Pre-filled, not for user selection
  imei: z.string(), // Pre-filled, not for user selection
  harnessId: z.string().min(1, 'Wire/Plug Harness is required.'),
  relayId: z.string().optional(),
  micId: z.string().optional(),
  sosButtonId: z.string().optional(),
  simId: z.string().min(1, 'A SIM card model must be selected.'),
  simIdentifier: z.string().min(1, 'A SIM (by IMSI) must be selected.'),
  devicePassword: z.string().optional(),
  dealerId: z.string().optional(),
  commission: z.coerce.number().min(0).optional(),
  phoneRobocall: z.string().min(1, 'Phone number for alerts is required.').transform(val => normalizeMultiplePhoneNumbers(val) || '').refine(val => val.length > 0, {
    message: "Alert phone number is invalid. Use 03..., +92..., etc. Separate multiple numbers with commas."
  }),
  contactNumberSameAsAlert: z.boolean().default(true),
  contactNumber: z.string().optional(),
  notificationIds: z.array(z.number()).optional(),
  isCompanyVehicle: z.boolean().default(false),
  renewalFee: z.coerce.number().min(0, 'Renewal fee cannot be negative.'),
  simCharges: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  hasPaidAmount: z.boolean().default(false),
  paidAmount: z.coerce.number().min(0).optional(),
})
.refine(data => {
    if (data.hasPaidAmount) {
        return data.paidAmount !== undefined && data.paidAmount >= 0;
    }
    return true;
}, {
    message: 'Paid amount is required when checked.',
    path: ['paidAmount'],
})
.refine(data => {
    if (data.relayId && data.relayId !== 'not-used') {
        return !!data.devicePassword && data.devicePassword.length >= 4;
    }
    return true;
}, {
    message: 'A password of at least 4 characters is required when a relay is used.',
    path: ['devicePassword'],
})
.refine(data => {
    if (!data.isCompanyVehicle) {
        return data.renewalFee > 0;
    }
    return true;
}, {
    message: 'Renewal fee must be greater than 0 for non-company vehicles.',
    path: ['renewalFee'],
})
.refine(data => {
    if (!data.contactNumberSameAsAlert) {
        return !!data.contactNumber && data.contactNumber.length > 0;
    }
    return true;
}, {
    message: 'Contact number is required.',
    path: ['contactNumber'],
})
.refine(data => {
    if (!data.contactNumberSameAsAlert && data.contactNumber) {
        const normalized = normalizePhoneNumber(data.contactNumber);
        return !!normalized;
    }
    return true;
}, {
    message: "Contact number is invalid. Use 03..., +92..., etc.",
    path: ['contactNumber'],
});


type QuickSaleFormProps = {
  device: UnbilledDevice;
  setDialogOpen: (open: boolean) => void;
};

export default function QuickSaleForm({ device, setDialogOpen }: QuickSaleFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { devices: traccarDevices, mutate: mutateTraccarDevices } = useDevices();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCommandDialogOpen, setIsCommandDialogOpen] = useState(false);
  const [vehicleCard, setVehicleCard] = useState<File | null>(null);
  
  const { availableStock, isLoading: isLoadingAvailableStock } = useAvailableStock();
  const { inventoryItems: allInventory, isLoading: isLoadingAllInventory } = useInventory();
  
  const { users: traccarUsers, isLoading: isLoadingUsers } = useTraccarUsers();
  const { notifications, isLoading: isLoadingNotifications } = useNotifications();


  const { appSettings, isLoading: isLoadingSettings } = useAppSettings();
  const { dealers, isLoading: isLoadingDealers } = useDealers();

  const traccarDeviceDetails = useMemo(() => {
    return traccarDevices?.find(d => d.id === device.id);
  }, [traccarDevices, device.id]);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userIdOrName: '',
      devicePrice: 0,
      amount: 0,
      date: new Date(),
      vehicleNumber: device.name,
      trackerId: device.trackerId || '',
      imei: device.uniqueId,
      harnessId: '',
      relayId: 'not-used',
      micId: 'not-used',
      sosButtonId: 'not-used',
      simId: '',
      simIdentifier: '',
      devicePassword: '',
      dealerId: '',
      commission: 0,
      phoneRobocall: '03',
      contactNumberSameAsAlert: true,
      contactNumber: '03',
      notificationIds: [],
      isCompanyVehicle: false,
      renewalFee: 0,
      simCharges: 0,
      discount: 0,
      hasPaidAmount: false,
      paidAmount: 0,
    },
  });
  
  useEffect(() => {
    if (traccarDeviceDetails) {
        form.reset({
            ...form.getValues(),
            isCompanyVehicle: (traccarDeviceDetails.attributes?.renewalFee === 0) || false,
            renewalFee: Number(traccarDeviceDetails.attributes?.renewalFee) || 0,
            simCharges: Number(traccarDeviceDetails.attributes?.simCharges) || 0,
            discount: Number(traccarDeviceDetails.attributes?.discount) || 0,
            phoneRobocall: traccarDeviceDetails.attributes?.phoneRobocall || '03',
        });
    }
  }, [traccarDeviceDetails, form]);
  
  // Auto-select harness based on tracker
  useEffect(() => {
    if (device.trackerId && availableStock.length > 0) {
        const selectedTracker = availableStock.find(item => item.id === device.trackerId);
        const trackerName = selectedTracker?.name.split(' ')[0];
        if (trackerName) {
            const matchingHarness = availableStock.find(item => 
                item.type === 'wire_plug_harness' && 
                item.name.toLowerCase().includes(trackerName.toLowerCase())
            );
            if (matchingHarness) {
                form.setValue('harnessId', matchingHarness.id);
            }
        }
    }
  }, [device.trackerId, availableStock, form]);
  
  useEffect(() => {
    const currentBillingExpiry = traccarDeviceDetails?.attributes?.expiryDate || traccarDeviceDetails?.expirationTime;
    if (currentBillingExpiry && appSettings) {
        const expiryDate = parseISO(currentBillingExpiry);
        const renewalFee = Number(traccarDeviceDetails.attributes?.renewalFee) || 0;
        const threshold = appSettings.monthlyYearlyThreshold || 2000;
        const durationType = renewalFee > threshold ? 'yearly' : 'monthly';
        
        const installationDate = durationType === 'yearly' ? subYears(expiryDate, 1) : subMonths(expiryDate, 1);
        form.setValue('date', installationDate);
    }
  }, [traccarDeviceDetails, appSettings, form]);


  const selectedSimId = form.watch('simId');
  const isCompanyVehicle = form.watch('isCompanyVehicle');
  const selectedRelayId = form.watch('relayId');
  const contactNumberSameAsAlert = form.watch('contactNumberSameAsAlert');
  const phoneRobocall = form.watch('phoneRobocall');
  const renewalFee = form.watch('renewalFee');
  const dealerId = form.watch('dealerId');
  const amount = form.watch('amount');
  const devicePrice = form.watch('devicePrice');
  const discount = form.watch('discount');
  const hasPaidAmount = form.watch('hasPaidAmount');

  const [currentPeriodCharges, setCurrentPeriodCharges] = useState(0);

  // Set initial device price from app settings
  useEffect(() => {
    if (appSettings && !form.getValues('devicePrice')) {
        form.setValue('devicePrice', Number(appSettings.devicePrice) || 0);
    }
  }, [appSettings, form]);

  // Auto-calculate amount based on renewal fee, device price, and discount
  // Formula: (renewal fee / total period days * remaining days in current period) + devicePrice
  useEffect(() => {
    if (!appSettings || isCompanyVehicle) {
      setCurrentPeriodCharges(0);
      if (isCompanyVehicle) {
        form.setValue('amount', 0);
      }
      return;
    }
    
    const renewalFeeValue = Number(renewalFee) || 0;
    const threshold = appSettings.monthlyYearlyThreshold || 2000;
    const durationType = renewalFeeValue > threshold ? 'yearly' : 'monthly';
    const today = new Date();
    
    let totalPeriodDays: number;
    let remainingDays: number;
    
    if (durationType === 'monthly') {
      // Total days in current month
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      totalPeriodDays = differenceInDays(end, start) + 1;
      // Remaining days from today until end of month
      remainingDays = differenceInDays(end, today);
    } else {
      // Total days in current year
      const start = startOfYear(today);
      const end = endOfYear(today);
      totalPeriodDays = differenceInDays(end, start) + 1;
      // Remaining days from today until end of year
      remainingDays = differenceInDays(end, today);
    }

    // Ensure remainingDays is at least 0
    remainingDays = Math.max(0, remainingDays);
    
    const calculatedCharges = (renewalFeeValue / totalPeriodDays) * remainingDays;
    setCurrentPeriodCharges(Math.round(calculatedCharges));
    
    const devicePriceValue = Number(devicePrice) || 0;
    
    // Final amount = calculatedCharges + devicePrice (matching logic in AddSaleForm)
    // Using Math.round and ensuring numeric addition
    const totalAmount = Math.round(Number(devicePriceValue) + calculatedCharges);
    
    form.setValue('amount', totalAmount);
  }, [renewalFee, devicePrice, appSettings, isCompanyVehicle, form]);

  useEffect(() => {
    if (isCompanyVehicle) {
      form.setValue('renewalFee', 0);
      form.setValue('amount', 0);
    }
  }, [isCompanyVehicle, form]);

  useEffect(() => {
    if (contactNumberSameAsAlert) {
      form.setValue('contactNumber', phoneRobocall);
    }
  }, [contactNumberSameAsAlert, phoneRobocall, form]);


  const handleImsiFetch = async () => {
    setIsCommandDialogOpen(false);
    toast({ title: "Processing Command...", description: "Waiting for device to respond. This may take a moment." });

    try {
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        const events = await getTraccarDeviceEvents(device.id);
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
        
        for (const item of availableStock) {
            if (item.type === 'sim' && item.sims) {
                const foundSim = item.sims.find(s => s.imsi.endsWith(last4Digits));
                if (foundSim) {
                    form.setValue('simId', item.id, { shouldValidate: true });
                    setTimeout(() => {
                        form.setValue('simIdentifier', foundSim.imsi, { shouldValidate: true });
                        toast({ title: "SIM Auto-Selected", description: `Selected ${foundSim.simNumber} from inventory.` });
                    }, 100);
                    return;
                }
            }
        }

        throw new Error(`A SIM with IMSI ending in ${last4Digits} was not found in your available stock.`);

    } catch (error: any) {
        console.error(error.response?.data);
        toast({ variant: 'destructive', title: "Failed to Get IMSI", description: error.message });
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!vehicleCard) {
      toast({
        variant: 'destructive',
        title: 'Missing vehicle card',
        description: 'Vehicle Registration Card Image is required.',
      });
      return;
    }
    setIsSubmitting(true);
    
    const simItem = availableStock.find(item => item.id === values.simId);
    const selectedSim = simItem?.sims?.find(s => s.imsi === values.simIdentifier);

    if (!user || !selectedSim || !traccarDeviceDetails || !appSettings) {
      const missingData = [];
      if (!user) missingData.push('user authentication');
      if (!selectedSim) missingData.push('a selected SIM card from stock');
      if (!traccarDeviceDetails) missingData.push('full device details from server');
      if (!appSettings) missingData.push('application settings');

      toast({
        variant: 'destructive',
        title: 'Error: Missing Required Data',
        description: `Cannot create sale. The following are missing: ${missingData.join(', ')}.`,
      });
      setIsSubmitting(false);
      return;
    }

    try {
        let customerName = '';
        let userIdToAssign: number | null = null;
        let isUserAdmin = false;
        const existingUser = traccarUsers?.find(u => u.id.toString() === values.userIdOrName);

        if (existingUser) {
            userIdToAssign = existingUser.id;
            customerName = existingUser.name;
            isUserAdmin = existingUser.administrator === true;
        } else {
            customerName = values.userIdOrName;
            const tempEmail = `${customerName.replace(/\s+/g, '_').toLowerCase()}@almtrace.com`;
            try {
                const newUserPayload = { name: customerName, email: tempEmail, password: 'password' };
                const newUserResponse = await apiClient.post<TraccarUser>('/users', newUserPayload);
                userIdToAssign = newUserResponse.data.id;
                await addLog(`Auto-created new user: ${customerName}`, user.name, 'create');
            } catch (error: any) {
                if (error.response?.data?.includes('Duplicate entry')) {
                    toast({ variant: "destructive", title: "User Exists", description: "A user with a similar temporary email already exists. Please choose a more unique name or select the existing user."});
                    setIsSubmitting(false);
                    return;
                }
                throw error;
            }
        }
        
        const finalContactNumber = values.contactNumberSameAsAlert ? values.phoneRobocall : (normalizePhoneNumber(values.contactNumber || '') || '');
        
        const threshold = appSettings.monthlyYearlyThreshold || 2000;
        const durationType = values.isCompanyVehicle ? 'yearly' : (values.renewalFee > threshold ? 'yearly' : 'monthly');
        
        // Set initial expiry based on duration type (Monthly: 20th of next month, Yearly: 15th Feb of next year)
        // No more unlimited expiry for admins
        let initialExpiry: Date;
        if (durationType === 'monthly') {
            const nextMonth = addMonths(values.date, 1);
            initialExpiry = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
        } else {
            const nextYear = addYears(values.date, 1);
            initialExpiry = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59); // 1 is February
        }

        const attributes: { [key: string]: any } = {
            ...traccarDeviceDetails.attributes,
            InstallationDate: values.date.toISOString(),
            numberPlate: values.vehicleNumber.replace(/[-\s]/g, ''),
            phoneRobocall: values.phoneRobocall,
            uId: userIdToAssign,
            lastPaidOn: values.date.toISOString(),
            expdays: durationType === 'monthly' ? 20 : 15,
            expiryDate: initialExpiry.toISOString(),
        };

        if (!values.isCompanyVehicle) {
            attributes.renewalFee = values.renewalFee;
            if (values.simCharges && values.simCharges > 0) attributes.simCharges = values.simCharges;
            if (values.discount && values.discount > 0) attributes.discount = values.discount;
        } else {
          delete attributes.renewalFee;
        }
        
        if (values.relayId && values.relayId !== 'not-used' && values.devicePassword) {
            attributes.devicePassword = values.devicePassword;
        }
        
        const { position, ...traccarDeviceUpdatePayload } = {
          ...traccarDeviceDetails,
          name: values.vehicleNumber,
          expirationTime: initialExpiry.toISOString(),
          attributes: attributes,
        };
        delete (traccarDeviceUpdatePayload as any).userId;

        await apiClient.put(`/devices/${device.id}`, traccarDeviceUpdatePayload);
        
        if (userIdToAssign) {
            await apiClient.post('/permissions', { userId: userIdToAssign, deviceId: device.id });
        }

        // --- NEW WALLET INTEGRATION (MySQL/Prisma) ---
        if (values.hasPaidAmount && values.paidAmount !== undefined) {
          const discrepancy = Number(values.paidAmount) - Number(values.amount);
          
          if (discrepancy !== 0) {
            // Adjust user wallet
            await localApiClient.post('/wallet/update', {
                contactNumber: finalContactNumber,
                customerName: customerName,
                amount: discrepancy,
                description: `Payment discrepancy for ${values.vehicleNumber}: Required ${values.amount}, Paid ${values.paidAmount}`,
                traccarDeviceId: device.id,
                planType: durationType,
                planPrice: values.renewalFee,
                vehicleNumber: values.vehicleNumber,
                traccarUserId: userIdToAssign
            });
          } else {
            // Just ensure wallet/device exists even if no discrepancy
            await localApiClient.post('/wallet/update', {
                contactNumber: finalContactNumber,
                customerName: customerName,
                amount: 0,
                description: `Sale registration for ${values.vehicleNumber}`,
                traccarDeviceId: device.id,
                planType: durationType,
                planPrice: values.renewalFee,
                vehicleNumber: values.vehicleNumber,
                traccarUserId: userIdToAssign
            });
          }
        }
        // ------------------------------------------

        if (values.notificationIds && values.notificationIds.length > 0) {
            const notificationPromises = values.notificationIds.map(notificationId =>
              apiClient.post('/permissions', { deviceId: device.id, notificationId })
            );
            await Promise.all(notificationPromises);
        }

        if (values.isCompanyVehicle) {
            const vehicleData = {
              customerName: customerName,
              date: values.date.toISOString(),
              vehicleNumber: values.vehicleNumber,
              trackerId: values.trackerId,
              imei: values.imei,
              harnessId: values.harnessId,
              relayId: values.relayId,
              micId: values.micId,
              sosButtonId: values.sosButtonId,
              simId: values.simId,
              simNumber: selectedSim.simNumber,
              imsi: selectedSim.imsi,
              phoneRobocall: values.phoneRobocall,
              contactNumber: finalContactNumber,
              notificationIds: values.notificationIds,
              createdBy: user.name,
              monthId: format(values.date, 'yyyy-MM'),
              dealerId: values.dealerId !== 'direct' ? values.dealerId : undefined,
            };

            const vehicleRes = await localApiClient.post('/company-vehicles', vehicleData);
            const createdVehicleId = vehicleRes.data?.id;
            if (createdVehicleId && vehicleCard) {
              const fd = new FormData();
              fd.append('file', vehicleCard);
              const cardRes = await fetch(`/api/vehicles/company/${createdVehicleId}/card`, {
                method: 'POST',
                body: fd,
                credentials: 'include',
              });
              const cardJson = await cardRes.json().catch(() => ({}));
              if (!cardRes.ok) {
                throw new Error(cardJson.message || 'Vehicle card upload failed.');
              }
            }
            await addLog(`Added new company vehicle for ${values.vehicleNumber} via Quick Sale`, user.name, 'create');
            toast({ title: 'Company Vehicle & Device Updated', description: `${values.vehicleNumber} has been updated in server and logged.` });

        } else {
            const saleData: any = {
              customerName: customerName,
              amount: values.amount,
              devicePrice: values.devicePrice,
              currentPeriodCharges: currentPeriodCharges,
              date: values.date.toISOString(),
              vehicleNumber: values.vehicleNumber,
              trackerId: values.trackerId,
              imei: values.imei,
              harnessId: values.harnessId,
              relayId: values.relayId,
              micId: values.micId,
              sosButtonId: values.sosButtonId,
              simId: values.simId,
              simNumber: selectedSim.simNumber,
              imsi: selectedSim.imsi,
              phoneRobocall: values.phoneRobocall,
              contactNumber: finalContactNumber,
              notificationIds: values.notificationIds,
              monthId: format(values.date, 'yyyy-MM'),
              createdBy: user.name,
              status: 'active',
              renewalFee: values.renewalFee,
              simCharges: values.simCharges,
              discount: values.discount,
            };
            if (values.dealerId && values.dealerId !== 'direct') {
              saleData.dealerId = values.dealerId;
              if (values.commission && values.commission > 0) {
                saleData.commission = values.commission;
              }
            }

            // --- Wallet Sync Logic (MySQL) ---
            const diff = values.hasPaidAmount ? values.paidAmount - values.amount : 0;
            const thresholdValue = appSettings?.monthlyYearlyThreshold || 2000;
            const planTypeValue = values.renewalFee > thresholdValue ? 'yearly' : 'monthly';
            
            saleData.walletSync = {
                contactNumber: finalContactNumber,
                customerName: customerName,
                amount: diff,
                description: values.hasPaidAmount 
                    ? `Difference from quick sale for ${values.vehicleNumber} (Required: ${values.amount}, Paid: ${values.paidAmount})`
                    : `New quick sale logged for ${values.vehicleNumber}`,
                traccarDeviceId: device.id,
                planType: planTypeValue,
                planPrice: values.renewalFee,
                vehicleNumber: values.vehicleNumber,
                traccarUserId: userIdToAssign,
            };
            // ---------------------------------

            const saleRes = await localApiClient.post('/sales', saleData);
            const createdSaleId = saleRes.data?.id;
            if (createdSaleId && vehicleCard) {
              const fd = new FormData();
              fd.append('file', vehicleCard);
              const cardRes = await fetch(`/api/vehicles/sale/${createdSaleId}/card`, {
                method: 'POST',
                body: fd,
                credentials: 'include',
              });
              const cardJson = await cardRes.json().catch(() => ({}));
              if (!cardRes.ok) {
                throw new Error(cardJson.message || 'Vehicle card upload failed.');
              }
            }
            await addLog(`Added new sale for ${values.vehicleNumber} via Quick Sale`, user.name, 'create');
            toast({ title: 'Sale & Device Updated', description: `${values.vehicleNumber} has been updated in server and the sale has been logged.` });
        }

        mutateTraccarDevices();
        setDialogOpen(false);
    } catch (error: any) {
      console.error(error.response?.data);
      toast({ variant: 'destructive', title: 'Failed to add sale', description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const getItemsByType = (type: InventoryItem['type']) => availableStock?.filter((item) => item.type === type) || [];

  const renderSelect = (name: keyof z.infer<typeof formSchema>, label: string, type: InventoryItem['type'], isOptional: boolean = false) => {
    const items = getItemsByType(type);
    return (
      <FormField
        control={form.control} name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingAvailableStock}>
              <FormControl>
                <SelectTrigger><SelectValue placeholder={isLoadingAvailableStock ? "Loading stock..." : `Select...`} /></SelectTrigger>
              </FormControl>
              <SelectContent>
                {isOptional && <SelectItem value="not-used">Not Used</SelectItem>}
                {items.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} (Stock: {item.quantity})</SelectItem>)}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };
  
  const getAvailableSims = () => {
    if (!selectedSimId) return [];
    const simItem = availableStock.find(item => item.id === selectedSimId);
    return simItem?.sims?.map(sim => ({ value: sim.imsi, label: `${sim.simNumber} / ${sim.imsi}` })) || [];
  };

  const trackerName = allInventory?.find(i => i.id === device.trackerId)?.name || "Unknown Tracker";
  const monthlyYearlyThreshold = appSettings?.monthlyYearlyThreshold || 2000;
  const isLoading = isLoadingAvailableStock || isLoadingUsers || isLoadingDealers || isLoadingSettings || isLoadingAllInventory;

  return (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField
                control={form.control}
                name="userIdOrName"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>Customer Name</FormLabel>
                        <Combobox
                            options={traccarUsers?.map(u => ({ value: u.id.toString(), label: u.name })) || []}
                            value={field.value}
                            onChange={(value) => {
                                field.onChange(value);
                                const selectedUser = traccarUsers?.find(u => u.id.toString() === value);
                                if (selectedUser?.phone) {
                                    form.setValue('phoneRobocall', selectedUser.phone);
                                    form.setValue('contactNumber', selectedUser.phone);
                                }
                            }}
                            placeholder={isLoadingUsers ? "Loading users..." : "Select existing or type new..."}
                            searchPlaceholder="Search customers..."
                            noResultsMessage="No users found. Type a new name."
                            allowCustomValue
                        />
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
            control={form.control} name="devicePrice"
            render={({ field }) => ( <FormItem> <FormLabel>Device Price (PKR)</FormLabel> <FormControl><Input type="number" placeholder="7500" {...field} disabled={isCompanyVehicle}/></FormControl> <FormMessage /></FormItem> )}
            />
        </div>

        {!isCompanyVehicle && (
            <div className="bg-muted/30 p-3 rounded-lg border border-dashed text-xs space-y-1">
                <div className="flex justify-between">
                    <span>Device Price:</span>
                    <span className="font-mono">PKR {(Number(devicePrice) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span>Current Period Charges ({differenceInDays(
                        renewalFee > (appSettings?.monthlyYearlyThreshold || 2000) 
                            ? endOfYear(new Date()) 
                            : endOfMonth(new Date()),
                        new Date()
                    )} days):</span>
                    <span className="font-mono">PKR {currentPeriodCharges.toLocaleString()}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between font-bold text-base">
                    <span>Total Sale Amount:</span>
                    <span className="font-mono text-primary">PKR {amount?.toLocaleString() || 0}</span>
                </div>
                <p className="text-[10px] text-muted-foreground italic mt-1">
                    * Charges calculated from today until the end of current {renewalFee > (appSettings?.monthlyYearlyThreshold || 2000) ? 'year' : 'month'}.
                </p>
            </div>
        )}

        <Separator />
        <h4 className="text-sm font-medium text-muted-foreground">Detected Device & Subscription Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="vehicleNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Number</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="md:col-span-2 lg:col-span-4">
              <DocumentUploadField
                label="Vehicle Registration Card Image"
                value={vehicleCard}
                onChange={setVehicleCard}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1">
                <p className="text-xs font-semibold">Tracker</p>
                <p className="text-sm">{trackerName}</p>
            </div>
             <div className="space-y-1">
                <p className="text-xs font-semibold">IMEI</p>
                <p className="text-sm font-mono">{device.uniqueId}</p>
            </div>
             <FormField
                control={form.control} name="date"
                render={({ field }) => (
                <FormItem className="flex flex-col">
                    <FormLabel>Date of Sale</FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl>
                    <Button variant={'outline'} className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')} disabled>
                        {field.value ? format(field.value, 'PPP') : <span>Calculating...</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                    </FormControl></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled />
                    </PopoverContent></Popover><FormMessage />
                </FormItem>)}
            />
        </div>
        
        <Separator />
        <h4 className="text-sm font-medium text-muted-foreground">Select Hardware & Contact Info</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField
                control={form.control}
                name="dealerId"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Sold By (Dealer)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a dealer..."/>
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        <SelectItem value="direct">Direct Sale (No Dealer)</SelectItem>
                        {dealers?.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
            />
            {dealerId && dealerId !== 'direct' && (
                <FormField
                    control={form.control}
                    name="commission"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Commission Paid (PKR)</FormLabel>
                        <FormControl><Input type="number" placeholder="500" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
            )}
            {renderSelect('harnessId', 'Wire/Plug Harness', 'wire_plug_harness')}
            {renderSelect('relayId', 'Relay', 'relay', true)}
            {selectedRelayId && selectedRelayId !== 'not-used' && ( <FormField control={form.control} name="devicePassword" render={({ field }) => ( <FormItem><FormLabel>Device Password</FormLabel><FormControl><Input type="text" placeholder="e.g., 123456" {...field} /></FormControl><FormMessage /></FormItem>)} /> )}
            {renderSelect('micId', 'Microphone', 'mic', true)}
            {renderSelect('sosButtonId', 'SOS Button', 'sos_button', true)}

            <div className="space-y-2">
                {renderSelect('simId', 'SIM Card', 'sim')}
                {traccarDeviceDetails?.status === 'online' && (
                    <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setIsCommandDialogOpen(true)}>
                        <Wand2 className="mr-2" />
                        Fetch IMSI from Device
                    </Button>
                )}
            </div>

            <FormField control={form.control} name="simIdentifier" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>SIM (by IMSI)</FormLabel><Combobox options={getAvailableSims()} value={field.value} onChange={field.onChange} placeholder={!selectedSimId ? "Select SIM model first" : "Select available SIM"} searchPlaceholder="Search..." noResultsMessage="No SIMs found." disabled={!selectedSimId} /><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="phoneRobocall" render={({ field }) => ( <FormItem><FormLabel>Phone for Alerts</FormLabel><FormControl><Input type="text" placeholder="03001234567, 03009876543" {...field} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); } if (e.key === 'Insert' && e.shiftKey) { e.preventDefault(); } }} onPaste={(e) => { e.preventDefault(); }} onInput={(e) => { const target = e.target as HTMLInputElement; const newValue = target.value; const oldValue = field.value; if (newValue.length > oldValue.length + 1) { target.value = oldValue; e.preventDefault(); } }} /></FormControl><FormMessage /><FormDescription>Separate multiple numbers with commas. Manual editing allowed, but paste/auto-fill prevented.</FormDescription></FormItem> )} />
            
             <div>
                <FormField
                    control={form.control}
                    name="contactNumberSameAsAlert"
                    render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 mb-2">
                        <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                        />
                        </FormControl>
                        <FormLabel className="font-normal">
                           Contact number is same as alert number
                        </FormLabel>
                    </FormItem>
                    )}
                />
                {!contactNumberSameAsAlert && (
                     <FormField control={form.control} name="contactNumber" render={({ field }) => ( <FormItem><FormLabel>Contact Number</FormLabel><FormControl><Input type="tel" placeholder="03001234567" {...field} /></FormControl><FormMessage /></FormItem>)} />
                )}
            </div>
             <FormField
                control={form.control}
                name="notificationIds"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Link Notifications</FormLabel>
                    <Combobox
                        options={notifications?.filter(n => !n.always).map(n => ({ value: n.id.toString(), label: n.type })) || []}
                        placeholder={isLoadingNotifications ? "Loading..." : "Select notifications..."}
                        searchPlaceholder="Search notifications..."
                        noResultsMessage="No notifications found."
                        isMultiSelect
                        selectedValues={field.value?.map(String) || []}
                        onChange={(id) => {
                            const numId = Number(id);
                            const currentIds = field.value || [];
                            const newIds = currentIds.includes(numId)
                                ? currentIds.filter(i => i !== numId)
                                : [...currentIds, numId];
                            field.onChange(newIds);
                        }}
                    />
                    <FormDescription>Select which alerts to link to this device.</FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>
        
        <Separator />
        <h4 className="text-sm font-medium text-muted-foreground">Adjust Subscription Details (if needed)</h4>
        <div className="space-y-4 pt-2">
            <FormField control={form.control} name="isCompanyVehicle" render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 col-span-1 md:col-span-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Mark as Company Vehicle</FormLabel><FormDescription>Company vehicles have a renewal fee of 0 and a sale amount of 0.</FormDescription></div></FormItem>)} />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <FormField
                    control={form.control}
                    name="renewalFee"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Renewal Fee</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="4500" {...field} disabled={isCompanyVehicle} />
                        </FormControl>
                         <FormDescription className="text-xs">
                            {renewalFee > monthlyYearlyThreshold ? "Yearly plan detected." : "Monthly plan detected."}
                        </FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField control={form.control} name="simCharges" render={({ field }) => ( <FormItem><FormLabel>SIM Charges</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="discount" render={({ field }) => ( <FormItem><FormLabel>Discount</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <div className="pt-2">
                <FormField
                    control={form.control}
                    name="hasPaidAmount"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                            <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">
                            Paid amount is different from generated amount
                        </FormLabel>
                        </FormItem>
                    )}
                />
                {hasPaidAmount && (
                    <FormField
                        control={form.control}
                        name="paidAmount"
                        render={({ field }) => (
                        <FormItem className="pt-2">
                            <FormLabel>Actual Paid Amount (PKR)</FormLabel>
                            <FormControl>
                            <Input type="number" placeholder="0" {...field} />
                            </FormControl>
                            <FormMessage />
                            <FormDescription className="text-xs text-blue-600 dark:text-blue-400">
                                Difference will be added/subtracted from user wallet.
                            </FormDescription>
                        </FormItem>
                        )}
                    />
                )}
            </div>
        </div>
        
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting || isLoading}>
            {isSubmitting || isLoading ? ( <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> ) : 'Log Sale & Update Device' }
          </Button>
        </div>
      </form>
    </Form>
    {traccarDeviceDetails && (
        <SendCommandDialog 
            deviceId={traccarDeviceDetails.id}
            onCommandSent={handleImsiFetch}
            open={isCommandDialogOpen}
            onOpenChange={setIsCommandDialogOpen}
        />
    )}
    </>
  );
}
