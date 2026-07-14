
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

type PinDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  actionDescription: string;
};

export default function PinDialog({
  open,
  onOpenChange,
  onSuccess,
  actionDescription,
}: PinDialogProps) {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { verifyPin } = useAuth();
  const { toast } = useToast();

  const handleConfirm = async () => {
    setIsLoading(true);
    const isValid = await verifyPin(pin);
    if (isValid) {
      toast({
        title: 'PIN Verified',
        description: 'Proceeding with the action.',
      });
      onSuccess();
      onOpenChange(false);
      setPin('');
    } else {
      toast({
        variant: 'destructive',
        title: 'Invalid PIN',
        description: 'The PIN you entered is incorrect. Please try again.',
      });
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Security PIN</DialogTitle>
          <DialogDescription>
            Please enter your 6-digit security PIN to confirm the action: <strong>{actionDescription}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="pin-input" className="sr-only">
            PIN
          </Label>
          <Input
            id="pin-input"
            type="password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            autoComplete="off"
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            className="text-center text-2xl tracking-[0.6em]"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || pin.length !== 6}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
