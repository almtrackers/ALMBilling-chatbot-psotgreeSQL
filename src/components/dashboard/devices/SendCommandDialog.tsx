
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sendTraccarCommand } from '@/lib/api';

type SendCommandDialogProps = {
  deviceId: number;
  onCommandSent: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PREDEFINED_COMMANDS = [
  { value: 'PARAM#', label: 'PARAM#', description: 'For most standard devices.' },
  { value: 'YGCX#', label: 'YGCX#', description: 'For some Chinese variants.' },
];

export default function SendCommandDialog({ deviceId, onCommandSent, open, onOpenChange }: SendCommandDialogProps) {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState('PARAM#');
  const [customCommand, setCustomCommand] = useState('');
  const [commandType, setCommandType] = useState<'predefined' | 'custom'>('predefined');

  const handleSendCommand = async () => {
    const commandToSend = commandType === 'custom' ? customCommand : selectedCommand;

    if (!commandToSend) {
      toast({
        variant: 'destructive',
        title: 'No Command',
        description: 'Please select or enter a command to send.',
      });
      return;
    }

    setIsSending(true);

    try {
      await sendTraccarCommand(deviceId, commandToSend);
      onCommandSent(); // Trigger the callback to start polling for the result
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to Send Command',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Command to Device</DialogTitle>
          <DialogDescription>
            Select a predefined command or enter a custom one to get the device's IMSI.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <RadioGroup value={commandType} onValueChange={(v) => setCommandType(v as any)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="predefined" id="predefined" />
              <Label htmlFor="predefined">Select a predefined command</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom">Enter a custom command</Label>
            </div>
          </RadioGroup>

          {commandType === 'predefined' ? (
            <RadioGroup defaultValue={selectedCommand} onValueChange={setSelectedCommand} className="pl-6 space-y-2">
              {PREDEFINED_COMMANDS.map(cmd => (
                <div key={cmd.value} className="flex items-start space-x-2">
                    <RadioGroupItem value={cmd.value} id={cmd.value} className="mt-1" />
                    <div className="grid gap-1.5 leading-none">
                        <Label htmlFor={cmd.value}>{cmd.label}</Label>
                        <p className="text-xs text-muted-foreground">{cmd.description}</p>
                    </div>
                </div>
              ))}
            </RadioGroup>
          ) : (
            <div className="pl-6">
              <Input
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="e.g., APN,123456#"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSendCommand} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Command'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
