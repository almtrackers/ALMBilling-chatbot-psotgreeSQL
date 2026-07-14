
'use client';

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useInvoiceGenerationStatus } from '@/hooks/use-invoice-generation-status';
import { useInvoices } from '@/hooks/use-invoices';
import { useAuth } from '@/contexts/auth-context';
import { generateInvoicesFromTraccar } from '@/lib/invoice-service';
import { useToast } from '@/hooks/use-toast';
import { addLog } from '@/lib/log-service';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function InvoiceGenerationWarnings() {
  const { devicesDueForInvoice, isLoading } = useInvoiceGenerationStatus();
  const { mutate: mutateInvoices } = useInvoices();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!user || !isAdmin) return;
    setIsRefreshing(true);
    await addLog('Triggered invoice generation from warning alert', user.name, 'automation');
    try {
      await generateInvoicesFromTraccar(user.name, true);
      toast({
        title: 'Invoice Check Complete',
        description: 'Checked all devices and generated new invoices if needed.',
      });
      mutateInvoices();
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Invoice Generation Failed',
        description: error.message || 'Could not generate invoices.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (devicesDueForInvoice.length === 0) {
    return null; // No warnings to show
  }

  return (
    <Alert variant="destructive" className="relative">
      <AlertCircle className="h-4 w-4" />
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <AlertTitle>Pending Invoice Generation</AlertTitle>
          <AlertDescription>
            The following {devicesDueForInvoice.length} device(s) are due for renewal but do not have a pending invoice. Use the "Refresh" button to generate them.
            <ul className="mt-2 list-none space-y-1">
              {devicesDueForInvoice.slice(0, 5).map((device) => ( // Show first 5
                <li key={device.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium cursor-help">
                      {device.name} <span className="text-muted-foreground">({device.userName})</span>
                    </span>
                  <span className="text-muted-foreground">{device.uniqueId}</span>
                </li>
              ))}
              {devicesDueForInvoice.length > 5 && (
                <li className="text-sm text-muted-foreground">...and {devicesDueForInvoice.length - 5} more.</li>
              )}
            </ul>
          </AlertDescription>
        </div>
        {isAdmin && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="ml-4 shrink-0 bg-white hover:bg-red-50 text-red-600 border-red-200"
          >
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        )}
      </div>
    </Alert>
  );
}
