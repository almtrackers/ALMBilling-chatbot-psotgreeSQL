
'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Loader2, Phone } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api';

export default function AutomatedInvoiceManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleManualTrigger = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Not Authenticated',
        description: 'You must be logged in to perform this action.',
      });
      return;
    }
    setIsLoading(true);
    try {
      await apiClient.post('/invoices/generate', { adminName: user.name });
      toast({
        title: 'Invoice Generation Complete',
        description:
          'The system has checked all devices and generated any necessary invoices.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Invoice Generation Failed',
        description:
          error.response?.data?.error || error.message ||
          'An unexpected error occurred while generating invoices.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoCallTrigger = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Not Authenticated',
        description: 'You must be logged in to perform this action.',
      });
      return;
    }
    setIsLoading(true);
    try {
      await apiClient.post('/invoices/reminders/autocall', { adminName: user.name });
      toast({
        title: 'Auto-Call Check Complete',
        description:
          'The system has checked pending invoices and made calls for invoices expiring in 1 day (during calling hours).',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Auto-Call Check Failed',
        description:
          error.response?.data?.error || error.message ||
          'An unexpected error occurred while checking for auto-calls.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automated Invoice Generation</CardTitle>
        <CardDescription>
          This system automatically generates invoices for devices with
          expiring subscriptions based on their attributes on the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>How It Works</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>
                The system checks for devices nearing their{' '}
                <strong>expiryDate</strong> attribute.
              </li>
              <li>
                For <strong>yearly</strong> plans (default), invoices are
                created 30 days before expiry.
              </li>
              <li>
                For <strong>monthly</strong> plans, invoices are created 7 days
                before expiry.
              </li>
              <li>
                Financial details like <strong>renewalFee</strong> and{' '}
                <strong>simCharges</strong> are pulled directly from device
                attributes on the server.
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        <Separator />

        <div>
          <h3 className="text-lg font-medium">Manual Trigger</h3>
          <p className="text-sm text-muted-foreground mt-1">
            While this process runs automatically, you can manually trigger a
            check at any time. This is useful for testing or immediate invoice
            creation.
          </p>
          <Button
            onClick={handleManualTrigger}
            disabled={isLoading}
            className="mt-4"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking Devices...
              </>
            ) : (
              'Run Invoice Check Now'
            )}
          </Button>
        </div>

        <Separator />

        <div>
          <h3 className="text-lg font-medium">Auto-Call Reminders</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically call customers 1 day before invoice expiry (only once per invoice).
            Calls are only made between 1 PM - 8 PM Pakistan time.
          </p>
          <Button
            onClick={handleAutoCallTrigger}
            disabled={isLoading}
            variant="outline"
            className="mt-4"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking Invoices...
              </>
            ) : (
              <>
                <Phone className="mr-2 h-4 w-4" />
                Run Auto-Call Check Now
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
