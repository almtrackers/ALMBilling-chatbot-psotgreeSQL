'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Replace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSales } from '@/hooks/use-sales';
import { useCompanyVehicles } from '@/hooks/use-company-vehicles';
import type { UnbilledDevice } from '@/hooks/use-billing-status';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replacementDevice: UnbilledDevice | null;
  onReplaced: () => void;
};

export default function QuickReplaceHardwareDialog({
  open,
  onOpenChange,
  replacementDevice,
  onReplaced,
}: Props) {
  const { toast } = useToast();
  const { sales, mutate: mutateSales } = useSales();
  const { companyVehicles, mutate: mutateCompanyVehicles } = useCompanyVehicles();
  const [recordKey, setRecordKey] = useState('');
  const [oldTrackerCondition, setOldTrackerCondition] = useState<'faulty' | 'working'>('faulty');
  const [reason, setReason] = useState('');
  const [billingOnly, setBillingOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setRecordKey('');
      setOldTrackerCondition('faulty');
      setReason('');
      setBillingOnly(false);
    }
  }, [open]);

  const recordOptions = useMemo(() => {
    const saleOptions = (Array.isArray(sales) ? sales : [])
      .filter((sale) => sale.imei && sale.status !== 'unsubscribed')
      .map((sale) => ({
        value: `sale:${sale.id}`,
        label: `${sale.vehicleNumber} — ${sale.customerName} — IMEI ${sale.imei}`,
      }));
    const companyOptions = (Array.isArray(companyVehicles) ? companyVehicles : [])
      .filter((vehicle) => vehicle.imei)
      .map((vehicle) => ({
        value: `companyVehicle:${vehicle.id}`,
        label: `${vehicle.vehicleNumber} — ${vehicle.customerName} — IMEI ${vehicle.imei}`,
      }));
    return [...saleOptions, ...companyOptions];
  }, [sales, companyVehicles]);

  const handleSubmit = async () => {
    if (!replacementDevice?.trackerId) {
      toast({
        variant: 'destructive',
        title: 'Tracker not in stock',
        description: 'Add this IMEI to tracker inventory before replacing older hardware.',
      });
      return;
    }
    if (!recordKey || !reason) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Select the older vehicle and a replacement reason.',
      });
      return;
    }

    const [recordType, recordId] = recordKey.split(':');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/sales/quick-replace-hardware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recordType,
          recordId,
          replacementDeviceId: replacementDevice.id,
          replacementImei: replacementDevice.uniqueId,
          newTrackerId: replacementDevice.trackerId,
          oldTrackerCondition,
          reason,
          billingOnly,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || 'Hardware replacement failed.');
      }

      await Promise.all([mutateSales(), mutateCompanyVehicles()]);
      onReplaced();
      onOpenChange(false);
      toast({ title: 'Hardware Replaced', description: result.message });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Replacement Failed',
        description: error instanceof Error ? error.message : 'Hardware replacement failed.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick Replace Tracker</DialogTitle>
          <DialogDescription>
            Assign the newly detected IMEI to an older billed vehicle while keeping that
            vehicle&apos;s Traccar history and permissions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">New replacement hardware</div>
            <div>{replacementDevice?.name}</div>
            <div className="font-mono text-muted-foreground">
              IMEI: {replacementDevice?.uniqueId}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Older vehicle to update</Label>
            <Combobox
              options={recordOptions}
              value={recordKey}
              onChange={setRecordKey}
              placeholder="Select older vehicle..."
              searchPlaceholder="Search vehicle, customer, or IMEI..."
              noResultsMessage="No billed vehicles found."
            />
          </div>

          <div className="space-y-2">
            <Label>Old tracker condition</Label>
            <RadioGroup
              value={oldTrackerCondition}
              onValueChange={(value) =>
                setOldTrackerCondition(value === 'working' ? 'working' : 'faulty')
              }
              className="flex gap-5"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="faulty" id="quick-old-faulty" />
                <Label htmlFor="quick-old-faulty" className="font-normal">
                  Faulty/Lost
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="working" id="quick-old-working" />
                <Label htmlFor="quick-old-working" className="font-normal">
                  Working (Restock)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Reason for replacement</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Faulty Hardware">Faulty Hardware</SelectItem>
                <SelectItem value="Lost/Stolen">Lost/Stolen</SelectItem>
                <SelectItem value="Customer Request/Upgrade">
                  Customer Request/Upgrade
                </SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="quick-billing-only"
              checked={billingOnly}
              onCheckedChange={(checked) => setBillingOnly(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="quick-billing-only">Only update sale/company record</Label>
              <p className="text-xs text-muted-foreground">
                Tick this when the IMEI was already replaced manually in Traccar. The system
                will not search, delete, or update any Traccar device.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !recordKey || !reason}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Replace className="mr-2 h-4 w-4" />
            )}
            Replace IMEI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
