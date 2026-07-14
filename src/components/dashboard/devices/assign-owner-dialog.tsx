'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useDevices } from '@/hooks/use-devices';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { addLog } from '@/lib/log-service';
import type { Device, TraccarUser } from '@/lib/types';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { Combobox } from '@/components/ui/combobox';

type AssignOwnerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function AssignOwnerDialog({
  open,
  onOpenChange,
}: AssignOwnerDialogProps) {
  const { user: adminUser } = useAuth();
  const { devices, isLoading: isLoadingAllDevices, mutate: mutateDevices } = useDevices();
  const { users, isLoading: isLoadingUsers, mutate: mutateUsers } = useTraccarUsers();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [assignments, setAssignments] = useState<Record<number, number | null>>({});
  const [isSaving, setIsSaving] = useState(false);

  const unassignedDevices = useMemo(() => {
    if (!devices) return [];
    return devices.filter(device => !device.attributes.uId);
  }, [devices]);

  const filteredDevices = useMemo(() => {
    if (!unassignedDevices) return [];
    if (!searchTerm) {
        return unassignedDevices;
    }
    const lowercasedTerm = searchTerm.toLowerCase();
    return unassignedDevices.filter(device =>
        (device.name.toLowerCase().includes(lowercasedTerm) ||
         device.uniqueId.toLowerCase().includes(lowercasedTerm))
    );
  }, [unassignedDevices, searchTerm]);

  const nonAdminUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(user => !user.administrator);
  }, [users]);

  const userOptions = useMemo(() => {
    return nonAdminUsers.map(user => ({ value: user.id.toString(), label: user.name }));
  }, [nonAdminUsers]);

  const handleUserSelect = (deviceId: number, userId: string) => {
    setAssignments(prev => ({
        ...prev,
        [deviceId]: userId ? Number(userId) : null
    }));
  }

  const handleSaveChanges = async () => {
    if (!adminUser) {
        toast({ variant: 'destructive', title: 'Authentication Error' });
        return;
    }
    setIsSaving(true);

    const updates = Object.entries(assignments).filter(([, userId]) => userId !== null);
    
    if (updates.length === 0) {
        toast({ title: 'No changes to save.' });
        setIsSaving(false);
        return;
    }

    const promises = updates.map(async ([deviceIdStr, userId]) => {
        const deviceId = Number(deviceIdStr);
        const deviceToUpdate = devices.find(d => d.id === deviceId);
        const userToAssign = nonAdminUsers.find(u => u.id === userId);

        if (deviceToUpdate && userToAssign) {
            const { position, ...payload } = {
                ...deviceToUpdate,
                attributes: {
                    ...deviceToUpdate.attributes,
                    uId: userToAssign.id,
                },
            };
            await apiClient.put(`/devices/${deviceId}`, payload);
            await addLog(`Assigned owner ${userToAssign.name} to device ${deviceToUpdate.name}`, adminUser.name, 'update');
        }
    });

    try {
        await Promise.all(promises);
        toast({
            title: 'Assignments Saved',
            description: `${updates.length} device(s) have been assigned an owner.`,
        });
        mutateDevices();
        mutateUsers();
        onOpenChange(false);
    } catch (error: any) {
        console.error(error.response?.data);
        toast({
            variant: 'destructive',
            title: 'Assignment Failed',
            description: error.message || 'An unexpected error occurred.',
        });
    } finally {
        setIsSaving(false);
    }
  };
  
  const isLoading = isLoadingAllDevices || isLoadingUsers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Assign Device Owners</DialogTitle>
          <DialogDescription>
            Assign a non-admin user as the owner for devices missing this information. This is used for invoicing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by device name or IMEI..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <ScrollArea className="h-72 w-full rounded-md border">
                <div className="p-4 space-y-4">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredDevices.length > 0 ? (
                    filteredDevices.map(device => (
                    <div key={device.id} className="grid grid-cols-2 gap-4 items-center">
                        <div>
                            <p className="font-medium">{device.name}</p>
                            <p className="text-xs text-muted-foreground">{device.uniqueId}</p>
                        </div>
                        <div>
                           <Combobox
                                options={userOptions}
                                value={assignments[device.id]?.toString()}
                                onChange={(userId) => handleUserSelect(device.id, userId)}
                                placeholder="Select an owner..."
                                searchPlaceholder="Search users..."
                                noResultsMessage="No users found."
                            />
                        </div>
                    </div>
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground text-center pt-10">
                        {unassignedDevices.length === 0 ? "All devices have an assigned owner." : "No devices match your search."}
                    </p>
                )}
                </div>
            </ScrollArea>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveChanges} disabled={isSaving || Object.keys(assignments).length === 0}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Save Assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
