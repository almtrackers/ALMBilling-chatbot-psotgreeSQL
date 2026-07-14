
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import InvoiceReceipt from '@/components/dashboard/invoices/invoice-receipt';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCrash } from 'lucide-react';
import PageHeader from '@/components/page-header';
import type { Invoice, Device } from '@/lib/types';
import useSWR from 'swr';
import { useDevices } from '@/hooks/use-devices';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function ReceiptContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { id } = params;
  const [hasPrinted, setHasPrinted] = useState(false);
  const { devices, isLoading: isLoadingDevices } = useDevices();

  const {
    data: invoiceResponse,
    isLoading: isLoadingInvoice,
    error,
  } = useSWR<Invoice[] | { success?: boolean; message?: string }>(
    id ? `/api/invoices?id=${encodeURIComponent(String(id))}` : null,
    fetcher
  );

  const invoiceRaw = Array.isArray(invoiceResponse) ? invoiceResponse[0] : null;

  const associatedDevices: Device[] = useMemo(() => {
    const devicesParam = searchParams.get('devices');
    if (!devicesParam) return [];
    try {
      return JSON.parse(devicesParam);
    } catch {
      return [];
    }
  }, [searchParams]);

  const invoice: Invoice | null = useMemo(() => {
    if (!invoiceRaw) return null;
    const rawDeviceIds = (invoiceRaw as any).deviceIds;
    let deviceIds: number[] = [];
    try {
      if (typeof rawDeviceIds === 'string') {
        deviceIds = JSON.parse(rawDeviceIds);
      } else if (Array.isArray(rawDeviceIds)) {
        deviceIds = rawDeviceIds;
      }
    } catch {
      deviceIds = [];
    }
    return { ...(invoiceRaw as any), deviceIds };
  }, [invoiceRaw]);

  const resolvedDevices: Device[] = useMemo(() => {
    if (associatedDevices.length > 0) return associatedDevices;
    if (!invoice || !devices) return [];
    if (!invoice.deviceIds || invoice.deviceIds.length === 0) return [];
    const map = new Map(devices.map((d) => [d.id, d]));
    return invoice.deviceIds.map((id) => map.get(id)).filter((d): d is Device => !!d);
  }, [associatedDevices, devices, invoice]);

  const payerName = searchParams.get('userName') || 'Valued Customer';
  
  useEffect(() => {
    if (!isLoadingInvoice && !isLoadingDevices && invoice && resolvedDevices.length > 0 && !hasPrinted) {
      setHasPrinted(true);
      setTimeout(() => {
        if (process.env.NODE_ENV !== 'development') {
          window.print();
        }
      }, 500);
    }
  }, [isLoadingInvoice, isLoadingDevices, invoice, resolvedDevices, hasPrinted]);

  const handleAfterPrint = () => {
    window.removeEventListener('afterprint', handleAfterPrint);
    router.replace('/dashboard/invoices');
  };

  useEffect(() => {
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);


  if (isLoadingInvoice || (invoice && isLoadingDevices)) {
    return (
      <div className="space-y-6 p-4">
        <PageHeader title="Loading Receipt..." />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-4">
        <PageHeader title="Error" />
        <Alert variant="destructive">
          <ServerCrash className="h-4 w-4" />
          <AlertTitle>Failed to load invoice data</AlertTitle>
          <AlertDescription>
            There was a problem fetching the data for this receipt. Please try
            again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!invoice || resolvedDevices.length === 0) {
    return (
      <div className="space-y-6 p-4">
        <PageHeader title="Receipt Not Found" />
        <Alert>
          <AlertTitle>Could not find receipt details</AlertTitle>
          <AlertDescription>
            The invoice or associated devices could not be found. This can happen if the page is refreshed.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <InvoiceReceipt
        invoice={invoice}
        devices={resolvedDevices}
        payerName={payerName || invoice.customerName || invoice.customerIdentifier || 'Valued Customer'}
        onAfterPrint={handleAfterPrint}
      />
    </div>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <ReceiptContent />
    </Suspense>
  );
}
