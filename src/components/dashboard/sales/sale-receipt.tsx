
'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import Logo from '@/components/logo';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Printer, CheckCircle2 } from 'lucide-react';
import type { Sale, AppSettings } from '@/lib/types';
import { useDevices } from '@/hooks/use-devices';
import { useAppSettings } from '@/hooks/use-app-settings';
import QRCode from 'react-qr-code';
import { Skeleton } from '@/components/ui/skeleton';


interface SaleReceiptProps {
  sale: Sale;
  isPublicView?: boolean;
}

const ReceiptFooter = () => (
    <div className="text-center text-xs text-muted-foreground mt-8 print:mt-4">
      <p className="font-semibold whitespace-nowrap">AL-MUHAFIZ TRACKERS (PVT) LTD</p>
      <p>Helpline: +92 311 1133170 | Website: almtrace.com | Email: hello@almtrace.com</p>
      <p className="font-semibold mt-2 print:mt-1">Thank you for your business!</p>
    </div>
  );

const maskImei = (imei: string | undefined): string => {
  if (!imei || imei.length < 9) {
    return imei || 'N/A';
  }
  const start = imei.slice(0, 4);
  const end = imei.slice(-4);
  const middle = '*'.repeat(imei.length - 8);
  return `${start}${middle}${end}`;
};

export default function SaleReceipt({ sale, isPublicView = false }: SaleReceiptProps) {
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const { appSettings, isLoading: isLoadingSettings } = useAppSettings();


  const handlePrint = () => {
    window.print();
  };

  const device = useMemo(() => {
    if (isLoadingDevices) return null;
    return devices?.find(d => d.uniqueId === sale.imei);
  }, [devices, sale.imei, isLoadingDevices]);

  const { renewalFee, durationType, nextDueDate } = useMemo(() => {
      if (isLoadingSettings || !device || !appSettings) {
          return { renewalFee: 0, durationType: 'yearly', nextDueDate: 'N/A' };
      }
      const fee = device.attributes.renewalFee || 0;
      const threshold = appSettings.monthlyYearlyThreshold || 2000;
      const type = fee > threshold ? 'yearly' : 'monthly';
      const billingExpiry = device.attributes?.expiryDate || device.expirationTime;
      const date = billingExpiry ? format(new Date(billingExpiry), 'PPP') : 'N/A';
      return { renewalFee: fee, durationType: type, nextDueDate: date };
  }, [device, appSettings, isLoadingSettings]);

  const qrCodeValue = useMemo(() => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/verify?id=${sale.id}`;
  }, [sale.id]);

  if (!isPublicView && (isLoadingDevices || isLoadingSettings)) {
      return (
          <div className="p-8">
              <Skeleton className="h-[800px] w-full" />
          </div>
      )
  }

  if (isPublicView) {
    return (
      <>
        <style jsx global>{`
          @media print {
            body > * {
              display: none;
            }
            body > .printable-area,
            body > .printable-area * {
              display: block;
            }
            .printable-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
          }
        `}</style>
        <div className="printable-area">
          <div className="max-w-md mx-auto bg-background p-4 sm:p-8 print:p-0">
              <div className="flex justify-end mb-4 print:hidden">
                  <Button onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
              </div>
              <Card className="rounded-lg shadow-lg print:shadow-none print:border-none">
                  <CardContent className="p-6">
                      <div className="flex flex-col items-center justify-center space-y-4">
                          <Logo />
                          <div style={{ background: 'white', padding: '8px' }}>
                              <QRCode value={qrCodeValue} size={100} style={{ height: "auto", maxWidth: "100%", width: "100%" }} viewBox={`0 0 256 256`}/>
                          </div>
                          <div className="flex items-center text-green-600">
                              <CheckCircle2 className="h-12 w-12" />
                              <h2 className="text-xl font-semibold ml-2">Payment Confirmed</h2>
                          </div>
                      </div>

                      <Separator className="my-6" />

                      <div className="space-y-4 text-center">
                          <p className="text-muted-foreground">Total amount paid by</p>
                          <p className="text-lg font-semibold">{sale.customerName}</p>
                          <p className="text-3xl font-bold tracking-tight">PKR {Number(sale.amount).toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">on {format(new Date(sale.date), 'PPP')}</p>
                      </div>
                      <ReceiptFooter />
                  </CardContent>
              </Card>
          </div>
        </div>
      </>
    )
  }

  // Original detailed receipt for internal use
  return (
    <div className="max-w-3xl mx-auto bg-background p-4 sm:p-8 print:p-0 pos-receipt-container print:max-w-none print:mx-0">
      <div className="flex justify-end mb-4 no-print">
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" /> Print Receipt
        </Button>
      </div>

       {/* POS Receipt Format (visible only on print) */}
       <div className="hidden print:block print:p-0 print:shadow-none print:border-none print:text-[10px] print:leading-tight">
        <div className="flex flex-col items-center">
          <Logo />
           <div style={{ background: 'white', padding: '8px', marginTop: '8px' }}>
            <QRCode
              value={qrCodeValue}
              size={80}
              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              viewBox={`0 0 256 256`}
            />
          </div>
        </div>
        <Separator className="my-2 print:border-dashed" />
        
        <div className="text-xs space-y-1">
          <p>Vehicle: {sale.vehicleNumber}</p>
          <p>IMEI: {maskImei(sale.imei)}</p>
          <p>Billed To: {sale.customerName}</p>
          <p>Recorded by: {sale.createdBy}</p>
        </div>

        <Separator className="my-2 print:border-dashed" />

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b print:border-dashed">
              <th className="text-left font-semibold py-1">Description</th>
              <th className="text-right font-semibold py-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b print:border-dashed">
                <td className="py-1">New Device Installation & Subscription</td>
                <td className="text-right py-1">{Number(sale.amount).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end mt-2">
            <div className="w-full space-y-1 text-xs">
              <div className="flex justify-between font-semibold">
                <span>Total Paid</span>
                <span>PKR {Number(sale.amount).toLocaleString()}</span>
              </div>
            </div>
          </div>
        
        <Separator className="my-2 print:border-dashed" />
        
        <div className="text-xs mt-2 space-y-1">
            <p className="font-semibold">Next Subscription Details:</p>
            <p>Renewal Fee: PKR {renewalFee.toLocaleString()} / {durationType}</p>
            <p>Next Due Date: {nextDueDate}</p>
        </div>

        <ReceiptFooter />
      </div>

      {/* A4 Layout (hidden on print) */}
      <Card className="rounded-lg shadow-none border print:hidden">
        <CardHeader className="p-6">
          <div className="flex flex-col items-center justify-center gap-6">
            <Logo />
              <div style={{ background: 'white', padding: '8px' }}>
                <QRCode
                  value={qrCodeValue}
                  size={100}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  viewBox={`0 0 256 256`}
                />
              </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Billed To</h3>
              <p className="font-medium">{sale.customerName}</p>
              <p>Vehicle: {sale.vehicleNumber}</p>
              <p>IMEI: {maskImei(sale.imei)}</p>
            </div>
            <div className="sm:text-right">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Payment Details</h3>
              <p>Sale recorded by: {sale.createdBy}</p>
              <p>Payment Date: {format(new Date(sale.date), 'PPP')}</p>
            </div>
          </div>

          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-semibold p-2">Description</th>
                  <th className="text-right font-semibold p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-2">New Device Installation & Subscription</td>
                  <td className="text-right p-2">PKR {Number(sale.amount).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
             <div className="space-y-2">
                <h3 className="font-semibold">Next Subscription Details</h3>
                <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Renewal Fee:</span>
                        <span>PKR {renewalFee.toLocaleString()} / {durationType}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Next Due Date:</span>
                        <span className="font-medium">{nextDueDate}</span>
                    </div>
                </div>
            </div>
            <div className="flex justify-end items-end">
              <div className="w-full max-w-xs space-y-2">
                <Separator />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total Paid</span>
                  <span>PKR {Number(sale.amount).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <ReceiptFooter />

        </CardContent>
      </Card>
    </div>
  );
}
