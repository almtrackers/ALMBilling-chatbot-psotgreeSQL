
'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useInvoiceGenerationStatus } from '@/hooks/use-invoice-generation-status';
import { useInvoices } from '@/hooks/use-invoices';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

function expiryLabel(daysLeft?: number) {
  if (daysLeft == null) return '';
  if (daysLeft < 0) return `expired ${Math.abs(daysLeft)} day(s) ago`;
  if (daysLeft === 0) return 'expires today';
  return `expires in ${daysLeft} day(s)`;
}

export default function InvoiceGenerationWarnings() {
  const { devicesDueForInvoice, isLoading } = useInvoiceGenerationStatus();
  const { mutate: mutateInvoices } = useInvoices();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const autoRunDone = useRef(false);

  const runGeneration = async (showToast: boolean) => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/invoices/generate-expiring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName: user?.name || 'Invoices Page' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Generation failed');
      if (showToast || data.invoicesGenerated > 0) {
        toast({
          title: 'Pre-Expiry Invoice Check Complete',
          description: `${data.devicesExpiring} device(s) expiring within 7 days checked — ${data.invoicesGenerated} new invoice(s) generated.`,
        });
      }
      mutateInvoices();
    } catch (error: any) {
      if (showToast) {
        toast({
          variant: 'destructive',
          title: 'Invoice Generation Failed',
          description: error.message || 'Could not generate invoices.',
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Automatically generate invoices for expiring devices as soon as warnings appear.
  useEffect(() => {
    if (isLoading || autoRunDone.current) return;
    if (!isAdmin || devicesDueForInvoice.length === 0) return;
    autoRunDone.current = true;
    void runGeneration(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAdmin, devicesDueForInvoice.length]);

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
          <AlertTitle>Devices Expiring Soon — Invoice Needed</AlertTitle>
          <AlertDescription>
            {devicesDueForInvoice.length} device(s) expire within 7 days (or already expired) without a
            pending invoice covering the next period. Invoices are generated automatically; use
            &quot;Generate Now&quot; to run the check immediately.
            <ul className="mt-2 list-none space-y-1">
              {devicesDueForInvoice.slice(0, 5).map((device) => (
                <li key={device.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {device.name} <span className="text-muted-foreground">({device.userName})</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={device.daysLeft != null && device.daysLeft <= 0 ? 'destructive' : 'outline'}>
                      {expiryLabel(device.daysLeft)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {device.expiryDate ? format(device.expiryDate, 'dd MMM yyyy') : ''}
                    </span>
                  </span>
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
            onClick={() => runGeneration(true)}
            disabled={isRefreshing}
            className="ml-4 shrink-0 bg-white hover:bg-red-50 text-red-600 border-red-200"
          >
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Generate Now
          </Button>
        )}
      </div>
    </Alert>
  );
}
