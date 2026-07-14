
'use client';

import { useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import type { CompanyVehicle, Device } from '@/lib/types';
import { apiClient } from '@/lib/api';
import { useDevices } from '@/hooks/use-devices';
import { useCompanyVehicles } from '@/hooks/use-company-vehicles';
import { addLog } from '@/lib/log-service';
import { normalizePhoneNumber, normalizeMultiplePhoneNumbers } from '@/lib/utils';

const formSchema = z.object({
  customerName: z.string().min(1, 'Customer/Dept. Name is required.'),
  vehicleNumber: z.string().min(1, 'Vehicle number is required.'),
  phoneRobocall: z.string().min(1, 'Phone number for alerts is required.').transform(val => normalizeMultiplePhoneNumbers(val) || '').refine(val => val.length > 0, {
    message: "Alert phone number is invalid. Use 03..., +92..., etc. Separate multiple numbers with commas."
  }),
  contactNumber: z.string().min(1, 'Contact number is required.').transform(val => normalizePhoneNumber(val) || '').refine(val => val.length > 0, {
    message: "Contact number is invalid. Use 03..., +92..., etc."
  }),
  devicePassword: z.string().optional(),
});

type EditCompanyVehicleFormProps = {
  vehicle: CompanyVehicle;
  setDialogOpen: (open: boolean) => void;
};

export default function EditCompanyVehicleForm({ vehicle, setDialogOpen }: EditCompanyVehicleFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { devices, mutate: mutateDevices } = useDevices();
  const { mutate: mutateVehicles } = useCompanyVehicles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const device = devices?.find(d => d.uniqueId === vehicle.imei);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: vehicle.customerName,
      vehicleNumber: vehicle.vehicleNumber,
      phoneRobocall: vehicle.phoneRobocall || '',
      contactNumber: vehicle.contactNumber || '',
      devicePassword: device?.attributes.devicePassword || '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user || !device) {
      toast({ variant: 'destructive', title: 'Error', description: 'User or device not found.' });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Update Record via Prisma API
      const updatePayload: Partial<CompanyVehicle> = {
        customerName: values.customerName,
        vehicleNumber: values.vehicleNumber,
        phoneRobocall: values.phoneRobocall,
        contactNumber: values.contactNumber,
      };

      const response = await fetch(`/api/company-vehicles/${vehicle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      // 2. Update device on Traccar
      const deviceResponse = await apiClient.get<Device[]>(`/devices?id=${device.id}`);
      if (deviceResponse.data.length === 0) {
        throw new Error('Device not found on the server.');
      }
      const fullDeviceData = deviceResponse.data[0];
      
      const traccarUpdateData: Device = {
        ...fullDeviceData,
        name: values.vehicleNumber,
        attributes: {
          ...fullDeviceData.attributes,
          numberPlate: values.vehicleNumber.replace(/[-\s]/g, ''),
          phoneRobocall: values.phoneRobocall,
        },
      };

      if (values.devicePassword) {
        traccarUpdateData.attributes.devicePassword = values.devicePassword;
      }

      await apiClient.put(`/devices/${device.id}`, traccarUpdateData);

      // 3. Log and provide feedback
      await addLog(`Edited company vehicle ${values.vehicleNumber} (IMEI: ${vehicle.imei})`, user.name, 'update');
      toast({
        title: 'Update Successful',
        description: 'The vehicle and device details have been updated.',
      });
      
      mutateVehicles(); // Re-fetch Prisma data
      mutateDevices(); // Re-fetch Traccar device data
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="customerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Driver/Dept. Name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
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
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phoneRobocall"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Alert Number</FormLabel>
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
                <FormDescription>Separate multiple numbers with commas. Manual editing allowed, but paste/auto-fill prevented.</FormDescription>
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="contactNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Number</FormLabel>
                <FormControl><Input type="tel" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="devicePassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Device Password (optional)</FormLabel>
                <FormControl><Input type="text" placeholder="Leave blank to keep unchanged" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
