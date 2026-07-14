'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api';
import { addLog } from '@/lib/log-service';
import { Loader2 } from 'lucide-react';
import type { Device } from '@/lib/types';
import { parseISO } from 'date-fns';

type EditDeviceAttributesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: Device | null;
  warnings: string[];
  onSuccess?: () => void;
};

export default function EditDeviceAttributesDialog({
  open,
  onOpenChange,
  device,
  warnings,
  onSuccess,
}: EditDeviceAttributesDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [installationDate, setInstallationDate] = useState('');
  const [renewalFee, setRenewalFee] = useState('');
  const [uId, setUId] = useState('');

  // Initialize form values when device changes
  useEffect(() => {
    if (device) {
      // Get installationDate from various possible attribute names
      const installationDateValue =
        device.attributes?.installationDate ||
        device.attributes?.InstallationDate ||
        device.attributes?.installation_date ||
        device.attributes?.installDate;

      if (installationDateValue) {
        try {
          let dateValue: Date;
          if (typeof installationDateValue === 'string') {
            dateValue = parseISO(installationDateValue);
          } else if (typeof installationDateValue === 'number') {
            dateValue = new Date(installationDateValue > 1000000000000 ? installationDateValue : installationDateValue * 1000);
          } else {
            dateValue = new Date(installationDateValue);
          }
          
          if (!isNaN(dateValue.getTime())) {
            // Format as YYYY-MM-DD for date input
            const year = dateValue.getFullYear();
            const month = String(dateValue.getMonth() + 1).padStart(2, '0');
            const day = String(dateValue.getDate()).padStart(2, '0');
            setInstallationDate(`${year}-${month}-${day}`);
          }
        } catch (error) {
          console.error('Failed to parse installation date:', error);
        }
      } else {
        setInstallationDate('');
      }

      setRenewalFee(device.attributes?.renewalFee?.toString() || '');
      setUId(device.attributes?.uId?.toString() || '');
    }
  }, [device]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device || !user) return;

    setIsSubmitting(true);

    try {
      // Fetch the full device object to ensure a valid payload
      const deviceResponse = await apiClient.get<Device[]>(`/devices?id=${device.id}`);
      if (deviceResponse.data.length === 0) {
        throw new Error('Device not found on the server.');
      }
      const fullDeviceData = deviceResponse.data[0];

      // Prepare updated attributes
      const updatedAttributes: { [key: string]: any } = {
        ...fullDeviceData.attributes,
      };

      // Update installationDate (use InstallationDate with capital I as seen in the codebase)
      if (installationDate) {
        const dateObj = new Date(installationDate);
        if (!isNaN(dateObj.getTime())) {
          updatedAttributes.InstallationDate = dateObj.toISOString();
          // Also set lowercase version for compatibility
          updatedAttributes.installationDate = dateObj.toISOString();
        }
      }

      // Update renewalFee
      if (renewalFee) {
        const fee = Number(renewalFee);
        if (!isNaN(fee) && fee >= 0) {
          updatedAttributes.renewalFee = fee;
        }
      }

      // Update uId
      if (uId) {
        const userId = Number(uId);
        if (!isNaN(userId) && userId > 0) {
          updatedAttributes.uId = userId;
        }
      }

      // Remove position if it exists (not part of Device type but may be in API response)
      const { position, ...payload } = {
        ...fullDeviceData,
        attributes: updatedAttributes,
      } as any;

      await apiClient.put(`/devices/${device.id}`, payload);

      await addLog(
        `Updated device attributes for ${device.name} (ID: ${device.id})`,
        user.name,
        'update'
      );

      toast({
        title: 'Attributes Updated',
        description: 'Device attributes have been successfully updated.',
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to update device attributes:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.response?.data?.message || error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!device) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Device Attributes</DialogTitle>
          <DialogDescription>
            Update missing or invalid attributes for device: <strong>{device.name}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {warnings.includes('Missing installationDate') || warnings.includes('Invalid installationDate') ? (
            <div className="space-y-2">
              <Label htmlFor="installationDate">Installation Date *</Label>
              <Input
                id="installationDate"
                type="date"
                value={installationDate}
                onChange={(e) => setInstallationDate(e.target.value)}
                required={warnings.includes('Missing installationDate')}
              />
            </div>
          ) : null}

          {warnings.includes('Missing renewalFee') ? (
            <div className="space-y-2">
              <Label htmlFor="renewalFee">Renewal Fee (PKR) *</Label>
              <Input
                id="renewalFee"
                type="number"
                min="0"
                step="0.01"
                value={renewalFee}
                onChange={(e) => setRenewalFee(e.target.value)}
                placeholder="e.g., 2000 for monthly, 7000 for yearly"
                required={warnings.includes('Missing renewalFee')}
              />
            </div>
          ) : null}

          {warnings.includes('Missing uId') ? (
            <div className="space-y-2">
              <Label htmlFor="uId">User ID (Owner) *</Label>
              <Input
                id="uId"
                type="number"
                min="1"
                value={uId}
                onChange={(e) => setUId(e.target.value)}
                placeholder="Traccar user ID"
                required={warnings.includes('Missing uId')}
              />
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Attributes'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
