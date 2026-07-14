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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { apiClient, localApiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { addLog } from '@/lib/log-service';
import { useAuth } from '@/contexts/auth-context';
import type { Invoice, TraccarUser } from '@/lib/types';

interface ResolveUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onSuccess: () => void;
}

export default function ResolveUserDialog({
  open,
  onOpenChange,
  invoice,
  onSuccess,
}: ResolveUserDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<TraccarUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && invoice?.deviceIds?.[0]) {
      fetchUsers();
    }
  }, [open, invoice]);

  const fetchUsers = async () => {
    if (!invoice?.deviceIds?.[0]) return;
    setIsLoading(true);
    try {
      const response = await apiClient.get<TraccarUser[]>(`/users?deviceId=${invoice.deviceIds[0]}`);
      if (response.status === 200) {
        setUsers(response.data);
        // If there's already a customerIdentifier, try to pre-select it
        if (invoice.customerIdentifier && response.data.find(u => u.id.toString() === invoice.customerIdentifier)) {
          setSelectedUserId(invoice.customerIdentifier);
        }
      }
    } catch (error) {
      console.error('Failed to fetch users for device:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch users connected to this device.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!invoice || !selectedUserId || !user) return;

    const selectedUser = users.find((u) => u.id.toString() === selectedUserId);
    if (!selectedUser) return;

    setIsSubmitting(true);
    try {
      await localApiClient.patch(`/invoices/${invoice.id}`, {
        customerIdentifier: selectedUserId,
        customerName: selectedUser.name,
        requiresReview: false,
      });

      await addLog(
        `Resolved billing user for invoice #${invoice.id} to ${selectedUser.name}`,
        user.name,
        'update'
      );

      toast({
        title: 'User Resolved',
        description: `Invoice #${invoice.id} is now assigned to ${selectedUser.name}.`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to resolve user:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update the invoice.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve Billing User</DialogTitle>
          <DialogDescription>
            This device is connected to multiple users. Please select the correct user to bill for this invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="user-select">Select Billing User</Label>
            {isLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="user-select">
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={!selectedUserId || isSubmitting || isLoading}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resolve & Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
