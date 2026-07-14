
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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';
import { useDevices } from '@/hooks/use-devices';
import { sendTraccarCommand } from '@/lib/api';
import { Combobox } from '@/components/ui/combobox';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { useCommandResultStore } from '@/store/command-result-store';
import DeviceSmsNumberField from '@/components/dashboard/commands/device-sms-number-field';
import { toSmsE164 } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const formSchema = z.object({
  deviceId: z.string().min(1, { message: 'Please select a vehicle.' }),
  command: z.string().min(1, { message: 'Command cannot be empty.' }),
});

export default function SendDirectCommandForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const [isSending, setIsSending] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [smsNumber, setSmsNumber] = useState('');
  const [imsi, setImsi] = useState<string | null>(null);
  const [channel, setChannel] = useState<'network' | 'sms'>('network');
  const addSentCommand = useCommandResultStore((state) => state.addSentCommand);

  useEffect(() => {
    fetch('/api/commands/config')
      .then((r) => r.json())
      .then((data) => setSmsEnabled(Boolean(data.smsEnabled)))
      .catch(() => setSmsEnabled(false));
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      deviceId: '',
      command: '',
    },
  });

  const selectedDeviceId = form.watch('deviceId');
  const selectedDevice = devices?.find((d) => d.id.toString() === selectedDeviceId);
  const willUseSms = channel === 'sms';

  useEffect(() => {
    if (!selectedDevice) return;
    setChannel(selectedDevice.status === 'online' ? 'network' : 'sms');
  }, [selectedDevice]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to send commands.',
      });
      return;
    }
    setIsSending(true);

    try {
      if (willUseSms && !smsNumber.trim()) {
        toast({
          variant: 'destructive',
          title: 'SIM Number Required',
          description: 'Enter the SIM number to send SMS to this offline vehicle.',
        });
        setIsSending(false);
        return;
      }

      if (willUseSms && !toSmsE164(smsNumber.trim())) {
        toast({
          variant: 'destructive',
          title: 'Invalid SIM Number',
          description: 'Use format like 03001234567 (sent as +923001234567).',
        });
        setIsSending(false);
        return;
      }

      const device = devices?.find((d) => d.id.toString() === values.deviceId);
      const result = await sendTraccarCommand(Number(values.deviceId), values.command, {
        channel,
        smsTo: willUseSms ? smsNumber.trim() : undefined,
      });

      await addLog(
        `Sent direct command "${values.command}" to ${device?.name || 'device'} via ${result.channel}`,
        user.name,
        'info'
      );

      addSentCommand({
        deviceId: result.deviceId,
        deviceName: result.deviceName,
        commandName: 'Direct command',
        commandText: values.command,
        channel: result.channel,
        status: result.status === 'queued' ? 'queued' : 'pending',
        detail: result.detail,
        simNumber: result.simNumber || smsNumber.trim() || null,
        imsi: result.imsi || imsi,
      });

      toast({
        title: result.channel === 'sms' ? 'SMS Command Sent' : 'Command Sent',
        description:
          result.detail ||
          (result.channel === 'sms'
            ? `SMS sent to ${result.deviceName}${result.simNumber ? ` (SIM ${result.simNumber})` : ''}. Response will appear below when received.`
            : `Command sent to ${result.deviceName}. Response will appear below when received.`),
      });
      form.resetField('command');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
      toast({
        variant: 'destructive',
        title: 'Failed to Send Command',
        description: message,
      });
    } finally {
      setIsSending(false);
    }
  };

  const visibleDevices = offlineOnly
    ? devices?.filter((d) => d.status !== 'online')
    : devices;

  const deviceOptions =
    visibleDevices?.map((d) => {
      const offlineSms = d.status !== 'online' && smsEnabled;
      const statusLabel =
        d.status === 'online' ? 'online' : offlineSms ? 'offline · SMS' : 'offline';
      return {
        value: d.id.toString(),
        label: `${d.name} (${statusLabel})`,
      };
    }) || [];

  const handleOfflineOnlyChange = (checked: boolean) => {
    setOfflineOnly(checked);
    // Clear selection if the currently selected device is filtered out
    if (checked && selectedDevice && selectedDevice.status === 'online') {
      form.setValue('deviceId', '');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-end gap-4">
        <FormField
          control={form.control}
          name="deviceId"
          render={({ field }) => (
            <FormItem className="w-full sm:w-1/3">
              <div className="flex items-center justify-between gap-2">
                <FormLabel>Vehicle (No.)</FormLabel>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="offline-only"
                    checked={offlineOnly}
                    onCheckedChange={(checked) => handleOfflineOnlyChange(checked === true)}
                  />
                  <Label htmlFor="offline-only" className="text-xs font-normal text-muted-foreground cursor-pointer">
                    Offline only
                  </Label>
                </div>
              </div>
              <Combobox
                options={deviceOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder={isLoadingDevices ? 'Loading...' : 'Select vehicle...'}
                searchPlaceholder="Search vehicles..."
                noResultsMessage={offlineOnly ? 'No offline vehicles found.' : 'No vehicles found.'}
                disabled={isLoadingDevices}
              />
              {willUseSms && (
                <FormDescription className="text-xs">
                  SMS channel selected — review the destination number below.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="command"
          render={({ field }) => (
            <FormItem className="flex-1 w-full">
              <FormLabel>Command String</FormLabel>
              <FormControl>
                <Input placeholder="e.g., PARAM#" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={isSending} className="w-full sm:w-auto">
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send
          </Button>
        </div>
        </div>

        {willUseSms && (
          <DeviceSmsNumberField
            deviceId={selectedDeviceId || null}
            enabled={willUseSms}
            value={smsNumber}
            onChange={setSmsNumber}
            imsi={imsi}
            onImsiLoaded={setImsi}
          />
        )}
        {selectedDevice && (
          <div className="space-y-2">
            <Label>Sending channel</Label>
            <RadioGroup
              value={channel}
              onValueChange={(value) => setChannel(value as 'network' | 'sms')}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="network" id="direct-channel-network" />
                <Label htmlFor="direct-channel-network" className="font-normal cursor-pointer">
                  Network
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="sms" id="direct-channel-sms" />
                <Label htmlFor="direct-channel-sms" className="font-normal cursor-pointer">
                  SMS Gateway
                </Label>
              </div>
            </RadioGroup>
            {channel === 'network' && selectedDevice.status !== 'online' && (
              <p className="text-xs text-amber-700">
                Vehicle is offline. Network delivery will be queued until it reconnects.
              </p>
            )}
            {channel === 'sms' && !smsEnabled && (
              <p className="text-xs text-destructive">
                SMS gateway is disabled or missing configuration. Set URL/token in .env and
                restart the server.
              </p>
            )}
          </div>
        )}
      </form>
    </Form>
  );
}
