
'use client';

import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useDevices } from '@/hooks/use-devices';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api';
import { Loader2, Search } from 'lucide-react';
import { addLog } from '@/lib/log-service';
import type { Device } from '@/lib/types';
import { useTraccarUsers } from '@/hooks/use-traccar-users';

type AssignDevicesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  userName: string;
};

const assignedDevicesFetcher = (url: string) => apiClient.get<Device[]>(url).then(res => res.data);

export default function AssignDevicesDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: AssignDevicesDialogProps) {
  const { user: adminUser } = useAuth();
  const { devices: allDevices, isLoading: isLoadingAllDevices, mutate: mutateAllDevices } = useDevices();
  const { mutate: mutateUsers } = useTraccarUsers();
  const { toast } = useToast();
  
  const { data: assignedDevices, isLoading: isLoadingAssigned } = useSWR<Device[]>(
    open ? `/devices?userId=${userId}` : null,
    assignedDevicesFetcher
  );

  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<number>>(new Set());
  const [initialDeviceIds, setInitialDeviceIds] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && assignedDevices) {
      const currentlyAssigned = new Set(assignedDevices.map(d => d.id));
      setSelectedDeviceIds(currentlyAssigned);
      setInitialDeviceIds(currentlyAssigned);
    }
  }, [open, assignedDevices]);

  const filteredDevices = useMemo(() => {
    if (!allDevices) return [];
    // Only show unassigned devices or devices assigned to the current user
    const relevantDevices = allDevices.filter(device => !device.userId || device.userId === userId);
    
    if (!searchTerm) {
        return relevantDevices;
    }
    const lowercasedTerm = searchTerm.toLowerCase();

    return relevantDevices.filter(device =>
        (device.name.toLowerCase().includes(lowercasedTerm) ||
         device.uniqueId.toLowerCase().includes(lowercasedTerm))
    );
  }, [allDevices, searchTerm, userId]);

  const handleToggleDevice = (deviceId: number) => {
    setSelectedDeviceIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deviceId)) {
        newSet.delete(deviceId);
      } else {
        newSet.add(deviceId);
      }
      return newSet;
    });
  };

  const handleSaveChanges = async () => {
    if (!adminUser) {
        toast({ variant: 'destructive', title: 'Authentication Error' });
        return;
    }
    setIsSaving(true);
    
    const toAssign = [...selectedDeviceIds].filter(id => !initialDeviceIds.has(id));
    const toUnassign = [...initialDeviceIds].filter(id => !selectedDeviceIds.has(id));

    try {
        const promises = [];

        if (toAssign.length > 0) {
            promises.push(...toAssign.map(deviceId => 
                apiClient.post('/permissions', { userId, deviceId })
            ));
        }

        if (toUnassign.length > 0) {
            promises.push(...toUnassign.map(deviceId =>
                apiClient.delete('/permissions', { data: { userId, deviceId } })
            ));
        }
        
        if (promises.length > 0) {
            await Promise.all(promises);
        }

        let toastDescription = '';
        if (toAssign.length > 0) toastDescription += `${toAssign.length} device(s) assigned. `;
        if (toUnassign.length > 0) toastDescription += `${toUnassign.length} device(s) unassigned.`;

        if (toastDescription) {
             toast({
                title: 'Assignments Updated',
                description: toastDescription,
            });
            await addLog(`Updated device assignments for user ${userName}`, adminUser.name, 'update');
        } else {
            toast({ title: 'No Changes', description: 'Device assignments were not changed.' });
        }
        
        mutateAllDevices();
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
  
  const isLoading = isLoadingAllDevices || isLoadingAssigned;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Devices for {userName}</DialogTitle>
          <DialogDescription>
            Assign or unassign devices for this user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by name or IMEI..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <ScrollArea className="h-72 w-full rounded-md border">
                <div className="p-4 space-y-2">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : filteredDevices.length > 0 ? (
                    filteredDevices.map(device => (
                    <div key={device.id} className="flex items-center space-x-2">
                        <Checkbox
                            id={`device-${device.id}`}
                            checked={selectedDeviceIds.has(device.id)}
                            onCheckedChange={() => handleToggleDevice(device.id)}
                        />
                        <Label htmlFor={`device-${device.id}`} className="font-normal w-full cursor-pointer">
                            <div className="flex justify-between w-full">
                                <span>{device.name}</span>
                                <span className="text-muted-foreground text-xs">{device.uniqueId}</span>
                            </div>
                        </Label>
                    </div>
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground text-center">No available devices found.</p>
                )}
                </div>
            </ScrollArea>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveChanges} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
