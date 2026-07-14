
'use client';

import { useState, useEffect } from 'react';
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
import { Loader2, Send } from 'lucide-react';
import type { CustomCommand } from '@/lib/types';
import { useDevices } from '@/hooks/use-devices';
import { sendTraccarCommand } from '@/lib/api';
import { Combobox } from '@/components/ui/combobox';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { useCommandResultStore } from '@/store/command-result-store';
import DeviceSmsNumberField from '@/components/dashboard/commands/device-sms-number-field';
import { toSmsE164 } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type SendCustomCommandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  command: CustomCommand | null;
};

export default function SendCustomCommandDialog({
  open,
  onOpenChange,
  command,
}: SendCustomCommandDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
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

  const selectedDevice = devices?.find((d) => d.id.toString() === selectedDeviceId);
  const willUseSms = channel === 'sms';

  useEffect(() => {
    if (!selectedDevice) return;
    setChannel(selectedDevice.status === 'online' ? 'network' : 'sms');
  }, [selectedDevice]);

  const handleSendCommand = async () => {
    if (!command || !selectedDeviceId || !user) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please select a command and a vehicle.',
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

      const result = await sendTraccarCommand(Number(selectedDeviceId), command.command, {
        channel,
        smsTo: willUseSms ? smsNumber.trim() : undefined,
      });

      await addLog(
        `Sent command "${command.name}" to ${result.deviceName} via ${result.channel}`,
        user.name,
        'info'
      );

      addSentCommand({
        deviceId: result.deviceId,
        deviceName: result.deviceName,
        commandName: command.name,
        commandText: command.command,
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
          `Command "${command.name}" sent to ${result.deviceName}${result.simNumber ? ` (SIM ${result.simNumber})` : ''}. Response will appear in activity below.`,
      });
      onOpenChange(false);
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

  const deviceOptions =
    devices?.map((d) => {
      const offlineSms = d.status !== 'online' && smsEnabled;
      const statusLabel =
        d.status === 'online' ? 'online' : offlineSms ? 'offline · SMS' : 'offline';
      return {
        value: d.id.toString(),
        label: `${d.name} (${statusLabel})`,
      };
    }) || [];

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          setSelectedDeviceId(null);
          setSmsNumber('');
          setImsi(null);
          setChannel('network');
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Command: {command?.name}</DialogTitle>
          <DialogDescription>
            Select a vehicle to send <code>{command?.command}</code>. Offline vehicles use SMS when
            gateway is configured in .env.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Combobox
            options={deviceOptions}
            value={selectedDeviceId || ''}
            onChange={(value) => setSelectedDeviceId(value)}
            placeholder={isLoadingDevices ? 'Loading vehicles...' : 'Select vehicle (No.)...'}
            searchPlaceholder="Search vehicles..."
            noResultsMessage="No vehicles found."
            disabled={isLoadingDevices}
          />
          <div className="space-y-2 pt-2">
            <Label>Sending channel</Label>
            <RadioGroup
              value={channel}
              onValueChange={(value) => setChannel(value as 'network' | 'sms')}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="network" id="saved-channel-network" />
                <Label htmlFor="saved-channel-network" className="font-normal cursor-pointer">
                  Network
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="sms" id="saved-channel-sms" />
                <Label htmlFor="saved-channel-sms" className="font-normal cursor-pointer">
                  SMS Gateway
                </Label>
              </div>
            </RadioGroup>
            {channel === 'network' && selectedDevice?.status !== 'online' && (
              <p className="text-xs text-amber-700">
                This vehicle is offline. Network delivery will be queued until it reconnects.
              </p>
            )}
            {channel === 'sms' && !smsEnabled && (
              <p className="text-xs text-destructive">
                SMS gateway is disabled or missing configuration. Set the gateway URL/token in
                .env and restart the server.
              </p>
            )}
          </div>
          {willUseSms && (
            <DeviceSmsNumberField
              deviceId={selectedDeviceId}
              enabled={willUseSms}
              value={smsNumber}
              onChange={setSmsNumber}
              imsi={imsi}
              onImsiLoaded={setImsi}
            />
          )}
          {willUseSms && !smsNumber && (
            <p className="text-xs text-muted-foreground">
              Selected vehicle is offline — command will be sent via SMS gateway.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSendCommand} disabled={isSending || !selectedDeviceId}>
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
