'use client';

import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import type { Notification } from '@/lib/types';
import { apiClient } from '@/lib/api';
import { useNotificators } from '@/hooks/use-notificators';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';

const NOTIFICATION_TYPES = [
  'alarm',
  'commandResult',
  'deviceMoving',
  'deviceOffline',
  'deviceOnline',
  'deviceOverspeed',
  'deviceStopped',
  'deviceUnknown',
  'geofenceEnter',
  'geofenceExit',
  'maintenance',
  'textMessage',
];

const ALARM_TYPES = [
    "general", "sos", "vibration", "movement", "overspeed", "fallDown", 
    "lowPower", "lowBattery", "fault", "powerOff", "powerOn", "door", 
    "lock", "unlock", "geofence", "geofenceEnter", "geofenceExit", 
    "gpsAntennaCut", "accident", "tow", "idle", "highRpm", "hardAcceleration", 
    "hardBraking", "hardCornering", "laneChange", "fatigueDriving", 
    "powerCut", "powerRestored", "jamming", "temperature", "parking", 
    "shock", "bonnet", "footBrake", "fuelLeak", "tampering", "removing"
];


const formSchema = z.object({
  type: z.string().min(1, 'Notification type is required.'),
  notificators: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: 'You have to select at least one channel.',
  }),
  alarms: z.array(z.string()).optional(),
  allAlarms: z.boolean().default(true),
}).refine(data => {
    if (data.type === 'alarm' && !data.allAlarms) {
        return data.alarms && data.alarms.length > 0;
    }
    return true;
}, {
    message: "Please select at least one alarm type.",
    path: ["alarms"],
});


type AddNotificationFormProps = {
  setDialogOpen: (open: boolean) => void;
  notificationToEdit?: Notification | null;
  onNotificationAdded?: () => void;
};

export default function AddNotificationForm({
  setDialogOpen,
  notificationToEdit,
  onNotificationAdded,
}: AddNotificationFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { notificators, isLoading: isLoadingNotificators } = useNotificators();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!notificationToEdit;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: '',
      notificators: [],
      alarms: [],
      allAlarms: true,
    },
  });

  useEffect(() => {
    if (isEditMode && notificationToEdit) {
        const hasAlarms = !!notificationToEdit.attributes?.alarms;
        form.reset({
            type: notificationToEdit.type,
            notificators: notificationToEdit.notificators.split(',').filter(Boolean),
            allAlarms: !hasAlarms,
            alarms: hasAlarms ? notificationToEdit.attributes.alarms.split(',') : [],
        });
    }
  }, [isEditMode, notificationToEdit, form]);
  
  const notificationType = form.watch('type');
  const allAlarms = form.watch('allAlarms');

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Authentication Error' });
      return;
    }
    setIsSubmitting(true);
    
    const attributes: { [key: string]: any } = {};
    if (values.type === 'alarm' && !values.allAlarms && values.alarms) {
        attributes.alarms = values.alarms.join(',');
    }

    const payload = {
      type: values.type,
      notificators: values.notificators.join(','),
      attributes,
      // 'always' is deprecated in favor of specific alarm types, but we keep it for compatibility if needed.
      // For now, we handle logic through presence of 'alarms' attribute.
      always: values.type !== 'alarm' || values.allAlarms, 
      calendarId: 0,
    };

    try {
      if (isEditMode && notificationToEdit) {
        await apiClient.put(`/notifications/${notificationToEdit.id}`, { id: notificationToEdit.id, ...payload });
        await addLog(`Updated notification: ${values.type}`, user.name, 'update');
        toast({ title: 'Notification Updated', description: 'The notification has been successfully updated.' });
      } else {
        await apiClient.post('/notifications', payload);
        await addLog(`Created new notification: ${values.type}`, user.name, 'create');
        toast({ title: 'Notification Created', description: 'The new notification has been saved.' });
      }
      if (onNotificationAdded) {
        onNotificationAdded();
      }
      setDialogOpen(false);
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notification Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select an event type..." /></SelectTrigger></FormControl>
                <SelectContent>
                  {NOTIFICATION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {notificationType === 'alarm' && (
            <div className="space-y-4 rounded-md border p-4">
                <FormField
                    control={form.control}
                    name="allAlarms"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            <FormLabel className="font-normal">Trigger for All Alarm Types</FormLabel>
                        </FormItem>
                    )}
                />
                {!allAlarms && (
                    <FormField
                        control={form.control}
                        name="alarms"
                        render={() => (
                            <FormItem>
                                <FormLabel>Specific Alarm Types</FormLabel>
                                <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-2">

                                    {ALARM_TYPES.map((alarm) => (
                                    <FormField
                                        key={alarm}
                                        control={form.control}
                                        name="alarms"
                                        render={({ field }) => {
                                        return (
                                            <FormItem key={alarm} className="flex flex-row items-start space-x-3 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                checked={field.value?.includes(alarm)}
                                                onCheckedChange={(checked) => {
                                                    return checked
                                                    ? field.onChange([...(field.value || []), alarm])
                                                    : field.onChange(
                                                        field.value?.filter(
                                                            (value) => value !== alarm
                                                        )
                                                        );
                                                }}
                                                />
                                            </FormControl>
                                            <FormLabel className="font-normal capitalize">{alarm}</FormLabel>
                                            </FormItem>
                                        );
                                        }}
                                    />
                                    ))}
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
            </div>
        )}

        <FormField
          control={form.control}
          name="notificators"
          render={() => (
            <FormItem>
              <div className="mb-4"><FormLabel>Notification Channels</FormLabel></div>
              {isLoadingNotificators ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-28" />
                </div>
              ) : (
                (notificators || []).map((item) => (
                  <FormField
                    key={item.type}
                    control={form.control}
                    name="notificators"
                    render={({ field }) => (
                      <FormItem key={item.type} className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(item.type)}
                            onCheckedChange={(checked) => {
                              return checked
                                ? field.onChange([...field.value, item.type])
                                : field.onChange(field.value?.filter((value) => value !== item.type));
                            }}
                          />
                        </FormControl>
                        <FormLabel className="font-normal capitalize">{item.type}</FormLabel>
                      </FormItem>
                    )}
                  />
                ))
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (isEditMode ? 'Save Changes' : 'Create Notification')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
