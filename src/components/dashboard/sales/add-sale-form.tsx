
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { format, addYears, addMonths, differenceInDays, startOfMonth, startOfYear, endOfMonth, endOfYear } from 'date-fns';
import { CalendarIcon, Loader2, Wand2, Calculator } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth as useTraccarAuth } from '@/contexts/auth-context';
import type { InventoryItem, Sale, SimCard, Dealer, AppSettings, CompanyVehicle, TraccarUser, Device, Notification } from '@/lib/types';
import { Combobox } from '@/components/ui/combobox';
import { DocumentUploadField } from '@/components/ui/document-upload-field';
import { apiClient, localApiClient, getTraccarDeviceEvents } from '@/lib/api';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { addLog } from '@/lib/log-service';
import { useAvailableStock } from '@/hooks/use-available-stock';
import { useSaleFormStore } from '@/store/sale-form-store';
import { useDevices } from '@/hooks/use-devices';
import { useSales } from '@/hooks/use-sales';
import { useCompanyVehicles } from '@/hooks/use-company-vehicles';
import SendCommandDialog from '../devices/SendCommandDialog';
import QRCodeScanner from '@/components/ui/qr-code-scanner';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { useDealers } from '@/hooks/use-dealers';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useNotifications } from '@/hooks/use-notifications';
import useSWR from 'swr';

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
  amount: z.coerce.number().min(0, 'Total amount must be a positive number.'),
  date: z.date(),
  vehicleNumber: z.string().min(1, 'Vehicle number is required.'),
  notes: z.string().optional(),
  // Installation Hardware
  stockSource: z.string().optional(),
  trackerId: z.string().min(1, 'Tracker model is required.'),
  imei: z.string().min(1, 'IMEI number is required.'),
  harnessId: z.string().min(1, 'Wire/Plug Harness is required.'),
  relayId: z.string().optional(),
  micId: z.string().optional(),
  sosButtonId: z.string().optional(),
  simId: z.string().min(1, 'A SIM card model must be selected.'),
  simIdentifier: z.string().min(1, 'A SIM (by Number or IMSI) must be selected.'),
  devicePassword: z.string().optional(),
  commission: z.coerce.number().min(0).optional(),
  phoneRobocall: z.string().min(1, 'Phone number for alerts is required.').transform(val => normalizeMultiplePhoneNumbers(val) || '').refine(val => val.length > 0, {
    message: "Alert phone number is invalid. Use 03..., +92..., etc. Separate multiple numbers with commas."
  }),
  contactNumberSameAsAlert: z.boolean().default(false),
  contactNumber: z.string().optional(),
  // Notifications
  notificationIds: z.array(z.number()).optional(),
  // Subscription Details
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

type AddSaleFormProps = {
  setDialogOpen: (open: boolean) => void;
};

export default function AddSaleForm({
  setDialogOpen,
}: AddSaleFormProps) {
  const { user } = useTraccarAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vehicleCard, setVehicleCard] = useState<File | null>(null);
  const { devices: traccarDevices, mutate: mutateTraccarDevices } = useDevices();
  const { mutate: mutateSales } = useSales();
  const { mutate: mutateVehicles } = useCompanyVehicles();
  const { prefillData, setPrefillData } = useSaleFormStore();
  const [isCommandDialogOpen, setIsCommandDialogOpen] = useState(false);
  const [scannedImeiToSet, setScannedImeiToSet] = useState<string | null>(null);

  const { dealers, isLoading: isLoadingDealers } = useDealers();
  const { appSettings, isLoading: isLoadingSettings } = useAppSettings();
  const { users: traccarUsers, isLoading: isLoadingUsers } = useTraccarUsers();
  const { notifications, isLoading: isLoadingNotifications } = useNotifications();
    
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userIdOrName: '',
      devicePrice: 0,
      amount: 0,
      date: new Date(),
      vehicleNumber: '',
      notes: '',
      stockSource: 'central',
      trackerId: '',
      imei: '',
      harnessId: '',
      relayId: 'not-used',
      micId: 'not-used',
      sosButtonId: 'not-used',
      simId: '',
      simIdentifier: '',
      devicePassword: '',
      commission: 0,
      phoneRobocall: '03',
      contactNumberSameAsAlert: false,
      contactNumber: '03',
      notificationIds: [],
      // Subscription
      isCompanyVehicle: false,
      renewalFee: 0,
      simCharges: 0,
      discount: 0,
      hasPaidAmount: false,
      paidAmount: 0,
    },
  });

  const selectedStockSource = form.watch('stockSource');
  const selectedTrackerId = form.watch('trackerId');
  const selectedSimId = form.watch('simId');
  const isCompanyVehicle = form.watch('isCompanyVehicle');
  const selectedRelayId = form.watch('relayId');
  const contactNumberSameAsAlert = form.watch('contactNumberSameAsAlert');
  const phoneRobocall = form.watch('phoneRobocall');
  const selectedSimIdentifier = form.watch('simIdentifier');
  const renewalFee = form.watch('renewalFee');
  const selectedImei = form.watch('imei');
  const devicePrice = form.watch('devicePrice');
  const saleDate = form.watch('date');
  const hasPaidAmount = form.watch('hasPaidAmount');
  
  const [currentPeriodCharges, setCurrentPeriodCharges] = useState(0);

  // Auto-calculate current period charges and total amount
  // Formula: (renewal fee / total period days * remaining days in current period) + device cost
  useEffect(() => {
    if (!appSettings || isCompanyVehicle) {
        setCurrentPeriodCharges(0);
        return;
    }

    const renewalFeeValue = Number(renewalFee) || 0;
    const devicePriceValue = Number(devicePrice) || 0;
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
    
    // Total amount is device price + current period charges
    // Use Number() to prevent string concatenation
    const totalAmount = Math.round(Number(devicePriceValue) + calculatedCharges);
    form.setValue('amount', totalAmount);
  }, [renewalFee, devicePrice, appSettings, isCompanyVehicle, form]);

  const { availableStock, isLoading: isLoadingStock } = useAvailableStock(selectedStockSource === 'central' ? null : selectedStockSource);

  const selectedSim = useMemo(() => {
    if (!selectedSimId || !selectedSimIdentifier) return null;
    const simItem = availableStock.find(item => item.id === selectedSimId);
    return simItem?.sims?.find(s => s.imsi === selectedSimIdentifier) || null;
  }, [availableStock, selectedSimId, selectedSimIdentifier]);

  const selectedTraccarDevice = useMemo(() => {
    return traccarDevices?.find(d => d.uniqueId === selectedImei);
  }, [traccarDevices, selectedImei]);

  useEffect(() => {
    if (prefillData) {
      form.setValue('vehicleNumber', prefillData.vehicleNumber);
      form.setValue('imei', prefillData.imei);
      form.setValue('trackerId', prefillData.trackerId);
      
      // Cleanup the store after using the data
      setPrefillData(null);
    }
  }, [prefillData, form, setPrefillData]);


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
  
  // Reset dependent fields when dealer changes
  useEffect(() => {
    form.setValue('trackerId', '');
    form.setValue('imei', '');
    form.setValue('simId', '');
    form.setValue('simIdentifier', '');
  }, [selectedStockSource, form]);

  useEffect(() => {
     // Auto-select harness based on tracker
     if (selectedTrackerId) {
        const selectedTracker = availableStock.find(item => item.id === selectedTrackerId);
        const trackerName = selectedTracker?.name.split(' ')[0]; // e.g., "GT06" from "GT06 Tracker"
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
  }, [selectedTrackerId, form, availableStock]);

  useEffect(() => {
    form.setValue('simIdentifier', '');
  }, [selectedSimId, form]);

  const handleImeiScanned = (scannedImei: string) => {
    // Check if IMEI is already active on server
    const deviceInUse = traccarDevices?.find(d => d.uniqueId === scannedImei);
    if (deviceInUse) {
        toast({
            variant: "destructive",
            title: "IMEI Already in Use",
            description: `This IMEI is already assigned to the device "${deviceInUse.name}".`,
        });
        return;
    }

    const foundItem = availableStock.find(item => 
      item.type === 'tracker' && item.imeis?.includes(scannedImei)
    );

    if (foundItem) {
      // Set the tracker model first
      form.setValue('trackerId', foundItem.id, { shouldValidate: true });
      // Store the scanned IMEI to be set in the useEffect below
      setScannedImeiToSet(scannedImei);
      toast({
        title: 'Tracker Model Found!',
        description: `Model "${foundItem.name}" automatically selected. IMEI will be set shortly.`,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'IMEI Not Found',
        description: `The scanned IMEI ${scannedImei} was not found in your available stock. Please check the stock source.`,
      });
    }
  };

  // This effect runs after the trackerId is set and the component re-renders
  useEffect(() => {
    if (scannedImeiToSet && selectedTrackerId) {
      const imeiOptions = getAvailableImeis();
      // Ensure the scanned IMEI is now in the list of available options
      if (imeiOptions.some(option => option.value === scannedImeiToSet)) {
        form.setValue('imei', scannedImeiToSet, { shouldValidate: true });
        setScannedImeiToSet(null); // Clear the temporary state
      }
    }
  }, [selectedTrackerId, scannedImeiToSet, form]);


  const handleImsiFetch = async () => {
    if (!selectedTraccarDevice) return;

    setIsCommandDialogOpen(false);
    toast({ title: "Processing Command...", description: "Waiting for device to respond. This may take a moment." });

    try {
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        const events = await getTraccarDeviceEvents(selectedTraccarDevice.id);
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

        for (const item of availableStock || []) {
            if (item.type === 'sim' && item.sims) {
                const foundSim = item.sims.find(s => s.imsi.endsWith(last4Digits));
                if (foundSim) {
                    form.setValue('simId', item.id, { shouldValidate: true });
                    setTimeout(() => {
                        form.setValue('simIdentifier', foundSim.imsi, { shouldValidate: true });
                        toast({ title: "SIM Auto-Selected", description: `Selected ${foundSim.simNumber} from inventory based on IMSI.` });
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
    if (!user || !selectedSim || !appSettings) {
      toast({
        variant: 'destructive',
        title: 'Authentication or Data Error',
        description: 'You must be logged in, a valid SIM must be selected, and app settings must be loaded.',
      });
      return;
    }
    if (!vehicleCard) {
      toast({
        variant: 'destructive',
        title: 'Missing vehicle card',
        description: 'Vehicle Registration Card Image is required.',
      });
      return;
    }
    setIsSubmitting(true);
    
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
          toast({
            variant: 'destructive',
            title: 'Complete user setup first',
            description:
              'Create the customer from Users with CNIC and CNIC front/back images, then select them here.',
          });
          setIsSubmitting(false);
          return;
      }

      const clientsRes = await fetch('/api/clients', { credentials: 'include' });
      const clientsJson = await clientsRes.json().catch(() => ({ clients: [] }));
      const clientDocs = (clientsJson.clients || []).find(
        (c: { traccarId?: number | null; name?: string; cnic?: string | null }) =>
          c.traccarId === userIdToAssign ||
          (c.name && c.name.toLowerCase() === customerName.toLowerCase())
      );
      if (!clientDocs?.cnic || !clientDocs?.cnicFrontPath || !clientDocs?.cnicBackPath) {
        toast({
          variant: 'destructive',
          title: 'Missing CNIC documents',
          description:
            'This customer needs CNIC and front/back images on the Users page before adding a vehicle.',
        });
        setIsSubmitting(false);
        return;
      }

      const finalContactNumber = values.contactNumberSameAsAlert ? values.phoneRobocall : (normalizePhoneNumber(values.contactNumber || '') || '');
      const threshold = appSettings.monthlyYearlyThreshold || 2000;
      const durationType = values.isCompanyVehicle ? 'yearly' : (values.renewalFee > threshold ? 'yearly' : 'monthly');

      // Rule: Expiry is 20th of the very next month (Monthly) or 15th Feb of next year (Yearly)
      // No more unlimited expiry for admins
      let initialExpiry: Date;
      if (durationType === 'monthly') {
          const nextMonth = addMonths(values.date, 1);
          initialExpiry = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
      } else {
          const nextYear = addYears(values.date, 1);
          initialExpiry = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59); // Month index 1 is February
      }
      
      const attributes: { [key: string]: any } = {
          InstallationDate: values.date.toISOString(),
          numberPlate: values.vehicleNumber.replace(/[-\s]/g, ''),
          phoneRobocall: values.phoneRobocall,
          uId: userIdToAssign,
          lastPaidOn: values.date.toISOString(),
          expdays: durationType === 'monthly' ? 20 : 15, // Reflecting the rules
          expiryDate: initialExpiry.toISOString(),
      };

      if (!values.isCompanyVehicle) {
        attributes.renewalFee = values.renewalFee;
        if (values.simCharges && values.simCharges > 0) {
            attributes.simCharges = values.simCharges;
        }
        if (values.discount && values.discount > 0) {
            attributes.discount = values.discount;
        }
      }

      if (values.relayId && values.relayId !== 'not-used' && values.devicePassword) {
          attributes.devicePassword = values.devicePassword;
      }
      
      let deviceToUpdate = traccarDevices?.find(d => d.uniqueId === values.imei);
      let deviceIdToLink: number | null = null;

      if (deviceToUpdate) {
        // Update existing device
        const updatePayload = {
            ...deviceToUpdate,
            name: values.vehicleNumber,
            expirationTime: initialExpiry.toISOString(),
            attributes: { ...deviceToUpdate.attributes, ...attributes },
        };
        // Do not send userId on update, link via permissions later
        delete (updatePayload as any).userId;
        await apiClient.put(`/devices/${deviceToUpdate.id}`, updatePayload);
        deviceIdToLink = deviceToUpdate.id;
        toast({
          title: 'Device Updated',
          description: `${values.vehicleNumber} was already on the server and has been updated.`,
        });
        await addLog(`Updated server device ${values.vehicleNumber} during sale creation`, user.name, 'update');
      } else {
        // Create new device
        const createPayload = {
            name: values.vehicleNumber,
            uniqueId: values.imei,
            expirationTime: initialExpiry.toISOString(),
            attributes: attributes,
        };
        const response = await apiClient.post<Device>('/devices', createPayload);
        deviceIdToLink = response.data.id;
      }

      // Link device to user
      if (deviceIdToLink && userIdToAssign) {
          await apiClient.post('/permissions', { userId: userIdToAssign, deviceId: deviceIdToLink });
          await addLog(`Linked device ${values.imei} to user ${customerName}`, user.name, 'update');
      }
      
      // Link notifications to device
      if (deviceIdToLink && values.notificationIds && values.notificationIds.length > 0) {
        const notificationPromises = values.notificationIds.map(notificationId =>
          apiClient.post('/permissions', { deviceId: deviceIdToLink, notificationId })
        );
        await Promise.all(notificationPromises);
        await addLog(`Linked ${values.notificationIds.length} notifications to device ${values.imei}`, user.name, 'update');
      }
      
      await mutateTraccarDevices();
      await mutateSales();
      await mutateVehicles();
      
      if (values.isCompanyVehicle) {
        const vehicleData: any = {
            customerName: customerName,
            date: values.date.toISOString(),
            vehicleNumber: values.vehicleNumber,
            notes: values.notes,
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
        };

        if (values.stockSource && values.stockSource !== 'central') {
            vehicleData.dealerId = values.stockSource;
        }

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
            throw new Error(
              cardJson.message ||
                'Vehicle saved but registration card upload failed. Upload it from the company vehicles page.'
            );
          }
        }
        await addLog(`Added new company vehicle: ${values.vehicleNumber}`, user.name, 'create');
        toast({
          title: 'Company Vehicle & Device Created/Updated',
          description: `${values.vehicleNumber} has been processed and logged as a company vehicle.`,
        });
      } else {
        const saleData: any = {
            customerName: customerName,
            devicePrice: values.devicePrice,
            currentPeriodCharges: currentPeriodCharges,
            amount: values.amount,
            date: values.date.toISOString(),
            vehicleNumber: values.vehicleNumber,
            notes: values.notes,
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
            hasPaidAmount: values.hasPaidAmount,
            paidAmount: values.paidAmount,
        };

        if (values.stockSource && values.stockSource !== 'central') {
            saleData.dealerId = values.stockSource;
            if (values.commission && values.commission > 0) {
              saleData.commission = values.commission;
            }
        }

        // Handle Wallet Sync
        const discrepancy = values.hasPaidAmount ? Number(values.paidAmount) - Number(values.amount) : 0;
        const planType = values.renewalFee > threshold ? 'yearly' : 'monthly';
        
        const walletSyncData = {
            contactNumber: finalContactNumber,
            customerName: customerName,
            amount: discrepancy,
            description: values.hasPaidAmount 
                ? `Difference from sale for ${values.vehicleNumber} (Required: ${values.amount}, Paid: ${values.paidAmount})`
                : `New sale logged for ${values.vehicleNumber}`,
            traccarDeviceId: deviceIdToLink,
            planType: planType,
            planPrice: values.renewalFee,
            vehicleNumber: values.vehicleNumber,
            traccarUserId: userIdToAssign
        };

        // Call wallet update separately for consistency and reliability
        await localApiClient.post('/wallet/update', walletSyncData);

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
            throw new Error(
              cardJson.message ||
                'Sale saved but registration card upload failed. Upload it from the sales list.'
            );
          }
        }
        
        toast({
          title: 'Sale & Device Created/Updated',
          description: `${values.vehicleNumber} has been processed and the sale has been logged.`,
        });
      }

      setDialogOpen(false);
    } catch (error: any) {
      console.error(error.response?.data);
      toast({
        variant: 'destructive',
        title: 'Failed to add sale',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getItemsByType = (type: InventoryItem['type']) => {
    return availableStock?.filter((item) => item.type === type) || [];
  };

  const renderSelect = (
    name: keyof z.infer<typeof formSchema>,
    label: string,
    type: InventoryItem['type'],
    isOptional: boolean = false
  ) => {
    const items = getItemsByType(type);
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={isLoadingStock}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue
                    placeholder={isLoadingStock ? "Loading stock..." : `Select a ${label.toLowerCase()}...`}
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {isOptional && <SelectItem value="not-used">Not Used</SelectItem>}
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} (Stock: {item.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };
  
  const getAvailableImeis = () => {
    if (!selectedTrackerId) return [];
    const tracker = availableStock.find(item => item.id === selectedTrackerId);
    return tracker?.imeis?.map(imei => ({ value: imei, label: imei })) || [];
  };

  const getAvailableSims = () => {
    if (!selectedSimId) return [];
    const simItem = availableStock.find(item => item.id === selectedSimId);
    return simItem?.sims?.map(sim => ({ value: sim.imsi, label: `${sim.simNumber} / ${sim.imsi}` })) || [];
  };

  const monthlyYearlyThreshold = appSettings?.monthlyYearlyThreshold || 2000;


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
                            placeholder={isLoadingUsers ? "Loading users..." : "Select existing or type new name..."}
                            searchPlaceholder="Search customers..."
                            noResultsMessage="No users found. Type a new name."
                            allowCustomValue
                        />
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
            control={form.control}
            name="vehicleNumber"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Vehicle Number</FormLabel>
                <FormControl>
                    <Input placeholder="e.g., ABC-123" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <DocumentUploadField
          label="Vehicle Registration Card Image"
          value={vehicleCard}
          onChange={setVehicleCard}
          required
          disabled={isSubmitting}
        />
        
        <Accordion type="multiple" defaultValue={['hardware', 'subscription']} className="w-full">
            <AccordionItem value="hardware">
                <AccordionTrigger className="text-sm font-medium">Installation Hardware</AccordionTrigger>
                <AccordionContent>
                    <div className="space-y-4 pt-2">
                        <FormField
                            control={form.control}
                            name="stockSource"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Stock Source</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingDealers}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a dealer or central stock..." />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="central">Direct Sale (Central Stock)</SelectItem>
                                        {dealers?.map(dealer => (
                                            <SelectItem key={dealer.id} value={dealer.id}>{dealer.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         {selectedStockSource && selectedStockSource !== 'central' && (
                            <FormField
                                control={form.control}
                                name="commission"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Commission Paid to Dealer (PKR)</FormLabel>
                                    <FormControl>
                                    <Input type="number" placeholder="e.g., 500" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        )}
                        <Separator />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {renderSelect('trackerId', 'Tracker Model', 'tracker')}
                            <FormField
                                control={form.control}
                                name="imei"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <div className="flex justify-between items-center">
                                        <FormLabel>IMEI</FormLabel>
                                        <QRCodeScanner 
                                            buttonText="Scan"
                                            onScan={handleImeiScanned}
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                    <Combobox
                                    options={getAvailableImeis()}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder={!selectedTrackerId ? "Select a tracker model first" : "Select an available IMEI"}
                                    searchPlaceholder="Search IMEI..."
                                    noResultsMessage="No available IMEIs found."
                                    disabled={!selectedTrackerId || getAvailableImeis().length === 0}
                                    />
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <div className="space-y-2">
                                {renderSelect('simId', 'SIM Card', 'sim')}
                                {selectedTraccarDevice?.status === 'online' && (
                                   <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setIsCommandDialogOpen(true)}>
                                       <Wand2 className="mr-2" />
                                       Fetch IMSI from Device
                                   </Button>
                                )}
                            </div>
                            <FormField
                            control={form.control}
                            name="simIdentifier"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                <FormLabel>SIM (by IMSI)</FormLabel>
                                <Combobox
                                    options={getAvailableSims()}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder={!selectedSimId ? "Select a SIM model first" : "Select an available SIM"}
                                    searchPlaceholder="Search by SIM Number or IMSI..."
                                    noResultsMessage="No available SIMs found."
                                    disabled={!selectedSimId || getAvailableSims().length === 0}
                                />
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                            {renderSelect('harnessId', 'Wire/Plug Harness', 'wire_plug_harness')}
                            {renderSelect('relayId', 'Relay', 'relay', true)}
                             {selectedRelayId && selectedRelayId !== 'not-used' && (
                                <FormField
                                    control={form.control}
                                    name="devicePassword"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Device Password</FormLabel>
                                        <FormControl>
                                            <Input type="text" placeholder="e.g., 123456" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            {renderSelect('micId', 'Microphone', 'mic', true)}
                            {renderSelect('sosButtonId', 'SOS Button', 'sos_button', true)}
                        </div>
                    </div>
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="customer">
                <AccordionTrigger className="text-sm font-medium">Customer Contact & Notifications</AccordionTrigger>
                <AccordionContent>
                    <div className="space-y-4 pt-2">
                        <FormField
                            control={form.control}
                            name="phoneRobocall"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Phone Number for Alerts</FormLabel>
                                <FormControl>
                                    <Input 
                                        type="text" 
                                        placeholder="03001234567, 03009876543" 
                                        {...field}
                                        onKeyDown={(e) => {
                                            // Prevent bulk input operations (Ctrl+V, paste, etc.) but allow manual editing
                                            if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
                                                e.preventDefault(); // Prevent paste
                                            }
                                            if (e.key === 'Insert' && e.shiftKey) {
                                                e.preventDefault(); // Prevent shift+insert paste
                                            }
                                        }}
                                        onPaste={(e) => {
                                            e.preventDefault(); // Completely prevent paste operations
                                        }}
                                        onInput={(e) => {
                                            // Prevent bulk input by checking if multiple characters were added at once
                                            const target = e.target as HTMLInputElement;
                                            const newValue = target.value;
                                            const oldValue = field.value;

                                            // If more than 2 characters were added at once, it might be paste/auto-fill
                                            if (newValue.length > oldValue.length + 1) {
                                                target.value = oldValue;
                                                e.preventDefault();
                                            }
                                        }}
                                    />
                                </FormControl>
                                <FormMessage />
                                <FormDescription>
                                    Separate multiple numbers with commas. Manual editing allowed, but paste/auto-fill prevented.
                                </FormDescription>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="contactNumberSameAsAlert"
                            render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                                </FormControl>
                                <FormLabel className="font-normal">
                                Contact number is the same as alert number
                                </FormLabel>
                            </FormItem>
                            )}
                        />
                        {!contactNumberSameAsAlert && (
                            <FormField
                                control={form.control}
                                name="contactNumber"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Contact Number</FormLabel>
                                    <FormControl>
                                        <Input type="tel" placeholder="03001234567" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
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
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="subscription">
                <AccordionTrigger className="text-sm font-medium">Subscription & Invoicing Details</AccordionTrigger>
                 <AccordionContent>
                    <div className="space-y-4 pt-2">
                        <FormDescription>
                            These details will be stored as attributes on the server to automate future invoicing.
                        </FormDescription>

                        <FormField
                            control={form.control}
                            name="isCompanyVehicle"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm col-span-1 md:col-span-2">
                                <FormControl>
                                    <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>Mark as Company Vehicle</FormLabel>
                                    <FormDescription>
                                    Company vehicles have a renewal fee of 0 and a sale amount of 0.
                                    </FormDescription>
                                </div>
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField
                                control={form.control}
                                name="renewalFee"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Renewal Fee (PKR)</FormLabel>
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
                            <FormField
                            control={form.control}
                            name="simCharges"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>SIM Charges</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="0" {...field} />
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
                                    <Input type="number" placeholder="0" {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
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
                </AccordionContent>
            </AccordionItem>
        </Accordion>
        
        <Separator />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField
                control={form.control}
                name="devicePrice"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Device Price (PKR)</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="5000" {...field} disabled={isCompanyVehicle} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel>Date of Sale</FormLabel>
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
        </div>

        {!isCompanyVehicle && (
            <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                    <span>Device Price:</span>
                    <span className="font-mono">PKR {devicePrice?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span>Current Period Charges ({differenceInDays(
                        renewalFee > (appSettings?.monthlyYearlyThreshold || 2000) 
                            ? startOfYear(addYears(saleDate, 1)) 
                            : startOfMonth(addMonths(saleDate, 1)),
                        saleDate
                    )} days):</span>
                    <span className="font-mono">PKR {currentPeriodCharges.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                    <span>Total Sale Amount:</span>
                    <span className="text-primary font-mono">PKR {form.watch('amount')?.toLocaleString() || 0}</span>
                </div>
                <p className="text-[10px] text-muted-foreground italic mt-2">
                    * Charges calculated from today until the end of current {renewalFee > (appSettings?.monthlyYearlyThreshold || 2000) ? 'year' : 'month'}.
                </p>
            </div>
        )}
        
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Relates to Invoice #123"
                  className="h-20"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Sale'
            )}
          </Button>
        </div>
      </form>
    </Form>
    {selectedTraccarDevice && (
        <SendCommandDialog 
            deviceId={selectedTraccarDevice.id}
            onCommandSent={handleImsiFetch}
            open={isCommandDialogOpen}
            onOpenChange={setIsCommandDialogOpen}
        />
    )}
    </>
  );
}
