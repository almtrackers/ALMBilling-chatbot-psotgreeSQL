
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useBillingStatus } from '@/hooks/use-billing-status';
import { AlertCircle, ServerCrash, ShoppingCart, PlusCircle, Trash2, Replace } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import QuickSaleForm from '@/components/dashboard/sales/quick-sale-form';
import QuickReplaceHardwareDialog from '@/components/dashboard/sales/quick-replace-hardware-dialog';
import QuickAddStockForm from '@/components/dashboard/inventory/quick-add-stock-form';
import type { UnbilledDevice } from '@/hooks/use-billing-status';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useDevices } from '@/hooks/use-devices';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';

const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Online</Badge>;
      case 'offline':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Offline</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

export default function BillingWarnings() {
  const { user } = useAuth();
  const { unbilledDevices, isLoading, error, mutate: mutateBillingStatus } = useBillingStatus();
  const { mutate: mutateDevices } = useDevices();
  const { toast } = useToast();
  const [isQuickSaleOpen, setIsQuickSaleOpen] = useState(false);
  const [isQuickReplaceOpen, setIsQuickReplaceOpen] = useState(false);
  const [isQuickAddStockOpen, setIsQuickAddStockOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<UnbilledDevice | null>(null);
  const [deviceToRemove, setDeviceToRemove] = useState<UnbilledDevice | null>(null);


  const handleMakeSale = (device: UnbilledDevice) => {
    setSelectedDevice(device);
    setIsQuickSaleOpen(true);
  };

  const handleReplaceHardware = (device: UnbilledDevice) => {
    setSelectedDevice(device);
    setIsQuickReplaceOpen(true);
  };

  const handleAddToStock = (device: UnbilledDevice) => {
    setSelectedDevice(device);
    setIsQuickAddStockOpen(true);
  };
  
  const handleRemoveDeviceClick = (device: UnbilledDevice) => {
    setDeviceToRemove(device);
    setIsRemoveDialogOpen(true);
  };

  const handleConfirmRemove = async () => {
    if (!deviceToRemove || !user) return;

    try {
      await apiClient.delete(`/devices/${deviceToRemove.id}`);
      toast({
        title: 'Device Removed',
        description: `Device ${deviceToRemove.name} (IMEI: ${deviceToRemove.uniqueId}) has been deleted from the server.`,
      });
      await addLog(`Removed unbilled device ${deviceToRemove.name} from server`, user.name, 'delete');
      mutateDevices();
      mutateBillingStatus();
    } catch (err: any) {
      console.error(err.response?.data);
      toast({
        variant: 'destructive',
        title: 'Failed to Remove Device',
        description: err.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsRemoveDialogOpen(false);
      setDeviceToRemove(null);
    }
  };


  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <ServerCrash className="h-4 w-4" />
        <AlertTitle>Could Not Check Billing Status</AlertTitle>
        <AlertDescription>
          There was an error comparing server devices and sales records.
        </AlertDescription>
      </Alert>
    );
  }

  if (!unbilledDevices || unbilledDevices.length === 0) {
    return null; // Don't render anything if there are no warnings
  }

  return (
    <>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Billing Warning: Devices Running Without a Sale Record</AlertTitle>
        <AlertDescription>
          The following devices exist on the server but do not have a corresponding sale record in the billing system. This may lead to unbilled services. Please create a sale record for them.
          <ul className="mt-2 list-none space-y-2">
            {unbilledDevices.map((device) => (
              <li key={device.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 rounded-md border border-dashed border-red-300/50 bg-red-500/5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>
                    <strong>{device.name}</strong> (IMEI: {device.uniqueId})
                  </span>
                  {getStatusBadge(device.status)}
                  {device.isInStock ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                      In Stock
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                      Not In Stock
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 mt-2 sm:mt-0">
                    {device.isInStock ? (
                    <>
                    <Button size="sm" variant="ghost" onClick={() => handleMakeSale(device)}>
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Make Sale
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleReplaceHardware(device)}>
                        <Replace className="mr-2 h-4 w-4" />
                        Replace Hardware
                    </Button>
                    </>
                    ) : (
                    <Button size="sm" variant="ghost" onClick={() => handleAddToStock(device)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add to Stock
                    </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => handleRemoveDeviceClick(device)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                    </Button>
                </div>
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      <Dialog open={isQuickSaleOpen} onOpenChange={setIsQuickSaleOpen}>
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>Create Quick Sale</DialogTitle>
                <DialogDescription>
                    Automatically detected details are pre-filled. Please complete the remaining fields to log the sale.
                </DialogDescription>
            </DialogHeader>
            {selectedDevice && (
                <QuickSaleForm
                    device={selectedDevice}
                    setDialogOpen={setIsQuickSaleOpen}
                />
            )}
        </DialogContent>
      </Dialog>

      <QuickReplaceHardwareDialog
        open={isQuickReplaceOpen}
        onOpenChange={setIsQuickReplaceOpen}
        replacementDevice={selectedDevice}
        onReplaced={() => {
          mutateDevices();
          mutateBillingStatus();
        }}
      />
      
      <Dialog open={isQuickAddStockOpen} onOpenChange={setIsQuickAddStockOpen}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>Quick Add to Stock</DialogTitle>
                <DialogDescription>
                   This device is active on the server but missing from your inventory. Add it here.
                </DialogDescription>
            </DialogHeader>
            {selectedDevice && (
                <QuickAddStockForm
                    device={selectedDevice}
                    setDialogOpen={setIsQuickAddStockOpen}
                />
            )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the device{' '}
              <strong>{deviceToRemove?.name} (IMEI: {deviceToRemove?.uniqueId})</strong>{' '}
              from the Traccar server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleConfirmRemove}
            >
              Yes, delete device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
