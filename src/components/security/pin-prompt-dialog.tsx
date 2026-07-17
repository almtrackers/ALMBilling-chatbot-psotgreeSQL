'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type PinPromptDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Called after the PIN is verified (or when no PIN is configured). */
  onSuccess: (pin: string) => void;
};

/**
 * Asks for the admin security PIN before a critical action.
 * If no PIN is configured in Settings, the action is BLOCKED until one is set.
 */
export default function PinPromptDialog({
  open,
  onOpenChange,
  title = 'Security PIN Required',
  description = 'Enter the security PIN to confirm this critical action.',
  onSuccess,
}: PinPromptDialogProps) {
  const { toast } = useToast();
  const [pin, setPin] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const probedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setPin('');
      setPinConfigured(null);
      probedRef.current = false;
      return;
    }
    if (probedRef.current) return;
    probedRef.current = true;

    // Check whether a PIN exists so we can show setup instructions if not.
    (async () => {
      try {
        const res = await fetch('/api/security/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ probe: true }),
        });
        const data = await res.json();
        if (res.ok) setPinConfigured(data.configured === true);
      } catch {
        // Unknown state — verification still happens on submit.
      }
    })();
  }, [open]);

  const handleVerify = async () => {
    if (!pin.trim()) return;
    setIsChecking(true);
    try {
      const res = await fetch('/api/security/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        throw new Error(data.message || 'Incorrect PIN.');
      }
      const verifiedPin = pin.trim();
      onOpenChange(false);
      onSuccess(verifiedPin);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'PIN Verification Failed',
        description: error instanceof Error ? error.message : 'Incorrect PIN.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {pinConfigured === false ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            No security PIN is configured. Go to <strong>Settings → Security PIN</strong> and set
            a PIN first — critical actions are blocked until then.
          </div>
        ) : (
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="Enter PIN..."
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleVerify();
            }}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isChecking}>
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={isChecking || !pin.trim() || pinConfigured === false}
          >
            {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
