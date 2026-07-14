
'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SaleReceipt from '@/components/dashboard/sales/sale-receipt';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCrash } from 'lucide-react';
import PageHeader from '@/components/page-header';
import type { Sale } from '@/lib/types';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function ReceiptContent() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;

  const {
    data: saleResponse,
    isLoading,
    error,
  } = useSWR<Sale[] | { success?: boolean; message?: string }>(
    id ? `/api/sales?id=${encodeURIComponent(String(id))}` : null,
    fetcher
  );

  const sale = Array.isArray(saleResponse) ? saleResponse[0] : null;

  const handleAfterPrint = () => {
    window.removeEventListener('afterprint', handleAfterPrint);
    // Use replace to avoid the print page being in browser history
    router.replace('/dashboard/sales');
  };

  useEffect(() => {
    if (sale && !isLoading) {
      window.addEventListener('afterprint', handleAfterPrint);
      // Add a small delay to ensure the DOM is updated before printing
      setTimeout(() => window.print(), 500); 
    }

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale, isLoading, router]);

  if (isLoading) {
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
          <AlertTitle>Failed to load sale data</AlertTitle>
          <AlertDescription>
            There was a problem fetching the data for this receipt. Please try
            again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="space-y-6 p-4">
        <PageHeader title="Receipt Not Found" />
        <Alert>
          <AlertTitle>Could not find receipt</AlertTitle>
          <AlertDescription>
            The receipt you are looking for does not exist or could not be
            loaded.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <SaleReceipt sale={sale} />
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
