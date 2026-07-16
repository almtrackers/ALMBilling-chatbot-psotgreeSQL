'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Inbox, Loader2, MessageSquareText, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCommandResultStore } from '@/store/command-result-store';
import { useToast } from '@/hooks/use-toast';

type StoredSms = {
  id: string;
  gatewayId: string;
  fromNumber: string;
  normalizedFrom: string;
  message: string;
  receivedAt: string;
  vehicleNumber: string | null;
  customerName: string | null;
  customerNumber: string | null;
  imsi: string | null;
};

const POLL_INTERVAL_MS = 3_000;

export default function SmsResponseList() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<StoredSms[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const addSmsResponse = useCommandResultStore((state) => state.addSmsResponse);

  const loadMessages = useCallback(async (showError = false) => {
    try {
      const response = await fetch('/api/sms', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to load SMS messages');
      }

      const rows = (data.messages || []) as StoredSms[];
      setMessages(rows);
      // Process oldest first so command matching remains chronological.
      [...rows].reverse().forEach((sms) => {
        addSmsResponse({
          id: sms.id,
          fromNumber: sms.fromNumber,
          normalizedFrom: sms.normalizedFrom,
          message: sms.message,
          receivedAt: sms.receivedAt,
          vehicleNumber: sms.vehicleNumber,
          imsi: sms.imsi,
        });
      });
    } catch (error: unknown) {
      if (showError) {
        toast({
          variant: 'destructive',
          title: 'Could not load SMS',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [addSmsResponse, toast]);

  useEffect(() => {
    void loadMessages(true);
    const timer = window.setInterval(() => void loadMessages(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  const deleteAll = async () => {
    if (!window.confirm('Delete all stored SMS responses? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      const response = await fetch('/api/sms', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete SMS messages');
      }
      setMessages([]);
      toast({
        title: 'SMS responses deleted',
        description: `${data.deleted || 0} message(s) removed from PostgreSQL.`,
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5" />
            Received SMS
          </CardTitle>
          <CardDescription>
            Incoming gateway messages saved in PostgreSQL and matched to command threads by SIM.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadMessages(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={deleteAll}
            disabled={isDeleting || messages.length === 0}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-72">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading SMS...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Inbox className="h-9 w-9" />
              <span>No received SMS yet</span>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {messages.map((sms) => (
                <div key={sms.id} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">
                      {sms.vehicleNumber || 'Unknown vehicle'} · {sms.normalizedFrom}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(sms.receivedAt), 'PPp')}
                    </span>
                  </div>
                  {(sms.customerName || sms.customerNumber) && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Customer: {sms.customerName || 'Unknown'}
                      {sms.customerNumber ? ` · ${sms.customerNumber}` : ''}
                    </div>
                  )}
                  <div className="mt-2 whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-sm">
                    {sms.message}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Gateway: {sms.gatewayId}
                    {sms.imsi ? ` · IMSI: ${sms.imsi}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
