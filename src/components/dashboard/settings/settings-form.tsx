
'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useUserPin } from '@/hooks/use-user-pin';
import type { AppSettings } from '@/lib/types';
import { addLog } from '@/lib/log-service';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import PinDialog from '@/components/auth/pin-dialog';
import { localApiClient } from '@/lib/api';

const formSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  invoiceDaysMonthly: z.coerce.number().int().min(1, 'Must be at least 1 day.').max(28, 'Must be 28 days or less.'),
  invoiceDaysYearly: z.coerce.number().int().min(1, 'Must be at least 1 day.').max(364, 'Must be 364 days or less.'),
  simCostPerDevice: z.coerce.number().min(0, 'SIM cost cannot be negative.'),
  monthlyYearlyThreshold: z.coerce.number().min(0, 'Threshold must be a positive number.'),
});

export default function SettingsForm() {
  const { user } = useAuth();
  const { appSettings: settings, isLoading: isLoadingSettings, mutate: mutateSettings } = useAppSettings();
  const { pinStatus: userPin } = useUserPin(user?.traccarId);
  const { toast } = useToast();
  const { setTheme } = useTheme();
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      theme: 'system',
      invoiceDaysMonthly: 7,
      invoiceDaysYearly: 30,
      simCostPerDevice: 150,
      monthlyYearlyThreshold: 2000,
    },
  });

  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting, isDirty },
  } = form;
  
  useEffect(() => {
    if (settings) {
      reset(settings);
      if (settings.theme) {
        setTheme(settings.theme);
      }
    }
  }, [settings, reset, setTheme]);
  
  const handleSave = async () => {
    const values = form.getValues();
    if (!user) {
      toast({ variant: 'destructive', title: 'Not authenticated' });
      return;
    }
    
    try {
      await localApiClient.post('/app-settings', values);
      setTheme(values.theme);
      mutateSettings();
      
      await addLog('Updated application settings', user.name, 'update');

      toast({
        title: 'Settings Saved',
        description: 'Your changes have been saved successfully.',
      });
      reset(values, { keepValues: true });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error Saving Settings',
        description: error.message || 'Failed to update settings.',
      });
    }
  };
  
  const onSubmit = () => {
    if (userPin) {
      setIsPinDialogOpen(true);
    } else {
      handleSave();
    }
  };
  
  if (isLoadingSettings) {
      return (
          <div className="space-y-8">
              <Skeleton className="h-10 w-1/3" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-10 w-1/2" />
          </div>
      )
  }

  return (
    <>
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={control}
          name="theme"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Theme</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a theme" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Choose the color scheme for the application.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={control}
          name="simCostPerDevice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cost per SIM (PKR)</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormDescription>
                This sets the unit cost for the automated monthly SIM charges expense.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="monthlyYearlyThreshold"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Monthly/Yearly Plan Threshold (PKR)</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormDescription>
                Renewal fees above this amount are considered 'yearly' plans. Fees at or below are 'monthly'.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField
            control={control}
            name="invoiceDaysMonthly"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Monthly Invoice Trigger</FormLabel>
                <FormControl>
                    <Input type="number" {...field} />
                </FormControl>
                <FormDescription>
                    Days before expiry to generate a monthly renewal invoice.
                </FormDescription>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={control}
            name="invoiceDaysYearly"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Yearly Invoice Trigger</FormLabel>
                <FormControl>
                    <Input type="number" {...field} />
                </FormControl>
                <FormDescription>
                    Days before expiry to generate a yearly renewal invoice.
                </FormDescription>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>

        <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</>
            ) : 'Save Changes'}
        </Button>
      </form>
    </Form>

    <PinDialog
      open={isPinDialogOpen}
      onOpenChange={setIsPinDialogOpen}
      onSuccess={handleSave}
      actionDescription="save application settings"
    />
    </>
  );
}

    