'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Invoice, Sale, Device } from '@/lib/types';
import SaleReceipt from '@/components/dashboard/sales/sale-receipt';
import InvoiceReceipt from '@/components/dashboard/invoices/invoice-receipt';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Search, ServerCrash, FileQuestion } from 'lucide-react';

const fetchJson = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return res.json();
};

const getPublicInvoiceById = async (id: string): Promise<Invoice | null> => {
  const data = await fetchJson(`/api/invoices?id=${encodeURIComponent(id)}`);
  return Array.isArray(data) ? (data[0] as Invoice) : null;
};

const getPublicSaleById = async (id: string): Promise<Sale | null> => {
  const data = await fetchJson(`/api/sales?id=${encodeURIComponent(id)}`);
  return Array.isArray(data) ? (data[0] as Sale) : null;
};

const getPublicSaleByVehicleNumber = async (vehicleNumber: string): Promise<Sale | null> => {
  const data = await fetchJson(`/api/sales?vehicleNumber=${encodeURIComponent(vehicleNumber)}`);
  return Array.isArray(data) ? (data[0] as Sale) : null;
};

// Device fallback (public view cannot fetch real device names)
const getPublicDevicesFromInvoice = (deviceIds: unknown): Device[] => {
  let ids: number[] = [];
  try {
    if (typeof deviceIds === 'string') {
      ids = JSON.parse(deviceIds);
    } else if (Array.isArray(deviceIds)) {
      ids = deviceIds as number[];
    }
  } catch {
    ids = [];
  }

  return (ids || []).map((id) => ({
    id,
    name: `Device ID: ${id}`,
    uniqueId: '******',
    status: 'unknown',
    lastUpdate: new Date().toISOString(),
    attributes: {},
  }));
};

export default function VerificationResult() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [result, setResult] = useState<any>(null);
  const [type, setType] = useState<'sale' | 'invoice' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('No ID provided. Please enter a receipt ID to verify.');
             setIsLoading(false);
      return;
    }

    const findReceipt = async () => {
      setIsLoading(true);
      setError(null);
      setResult(null);
      setType(null);

      try {
        // Check Invoice first
        const invoice = await getPublicInvoiceById(id);
        if (invoice) {

          // For invoice verification: use stored customerName, fall back to identifier
          const customerName =
            invoice.customerName || invoice.customerIdentifier || 'Valued Customer';

          const devices = getPublicDevicesFromInvoice((invoice as any).deviceIds);

          setResult({
            invoice,
            devices,
            userName: customerName, // customerName = customerIdentifier for invoices
          });

          setType('invoice');
          setIsLoading(false);
          return;
        }

        // Check Sale by ID
        const sale = await getPublicSaleById(id);
        if (sale) {
          setResult(sale);
          setType('sale');
          setIsLoading(false);
          return;
        }

        // Search Sale by Vehicle Number
        const saleByVehicle = await getPublicSaleByVehicleNumber(id.toUpperCase());
        if (saleByVehicle) {
          setResult(saleByVehicle);
          setType('sale');
          setIsLoading(false);
          return;
        }

        // Nothing found
        setError(`Invalid ID. No receipt found for "${id}".`);
      } catch (err: any) {
        console.error('Verification Error:', err);
        setError(err.message || 'An unexpected error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    findReceipt();
  }, [id]);

  // UI states
  if (isLoading) return <Skeleton className="h-96 w-full" />;
  
  if (!id) {
    return (
      <Alert>
        <Search className="h-4 w-4" />
        <AlertTitle>Ready to Verify</AlertTitle>
        <AlertDescription>
          Enter a receipt ID on the previous page to begin verification.
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <ServerCrash className="h-4 w-4" />
        <AlertTitle>Verification Failed</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!result) {
      return (
        <Alert variant="destructive">
            <FileQuestion className="h-4 w-4" />
        <AlertTitle>No Receipt Found</AlertTitle>
        <AlertDescription>
          Could not find a receipt with the ID "{id}". Please try again.
        </AlertDescription>
        </Alert>
    );
  }

  // Render receipt
  if (type === 'sale') {
    return <SaleReceipt sale={result} isPublicView={true} />;
  }

  if (type === 'invoice') {
    return (
      <InvoiceReceipt
        invoice={result.invoice}
        devices={result.devices}
        payerName={result.userName}
        isPublicView={true}
      />
    );
  }

  return null;
}
