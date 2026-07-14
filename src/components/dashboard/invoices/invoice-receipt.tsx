
'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/logo';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { CheckCircle2, AlertCircle, Printer } from 'lucide-react';
import type { Invoice, Device } from '@/lib/types';
import QRCode from 'react-qr-code';
import { Card, CardContent } from '@/components/ui/card';

interface InvoiceReceiptProps {
  invoice: Invoice;
  devices: Device[];
  payerName?: string;
  onAfterPrint?: () => void;
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

const toDateValue = (value: any): Date | null => {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return new Date(value);
};


export default function InvoiceReceipt({ invoice, devices, payerName, onAfterPrint, isPublicView = false }: InvoiceReceiptProps) {

  const handlePrint = () => {
    window.print();
  };

  const qrCodeValue = useMemo(() => {
    // Ensure the URL is absolute for external QR code scanners.
    // In development, this might point to localhost, which is fine.
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/verify?id=${invoice.id}`;
  }, [invoice.id]);

  const isPaid = invoice.status === 'paid';
  const hasMultipleDevices = devices.length > 1;

  const getDeviceRenewalFee = (device: Device): number => {
    return Number(device.attributes?.renewalFee) || 0;
  };

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
          <div className="max-w-md mx-auto bg-background p-2 sm:p-4 md:p-8 print:p-0">
              <div className="flex justify-end mb-2 sm:mb-4 print:hidden">
                  <Button onClick={handlePrint} size="sm" className="text-xs sm:text-sm">
                  <Printer className="mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Print
                  </Button>
              </div>
              <Card className="rounded-lg shadow-lg print:shadow-none print:border-none">
                  <CardContent className="p-3 sm:p-4 md:p-6">
                      <div className="flex flex-col items-center justify-center space-y-4">
                          <Logo />
                          <div style={{ background: 'white', padding: '8px' }}>
                              <QRCode value={qrCodeValue} size={100} style={{ height: "auto", maxWidth: "100%", width: "100%" }} viewBox={`0 0 256 256`}/>
                          </div>

                          {isPaid ? (
                              <div className="flex items-center text-green-600">
                                  <CheckCircle2 className="h-12 w-12" />
                                  <h2 className="text-xl font-semibold ml-2">Payment Confirmed</h2>
                              </div>
                          ) : (
                              <div className="flex items-center text-yellow-600">
                                  <AlertCircle className="h-12 w-12" />
                                  <h2 className="text-xl font-semibold ml-2">Payment Pending</h2>
                              </div>
                          )}
                      </div>

                      <Separator className="my-6" />

                      <div className="space-y-4 text-center">
                          {isPaid ? (
                              <>
                                  <div className="relative">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div 
                                        className="text-red-600 font-bold text-3xl transform -rotate-12 opacity-30 print:opacity-100 print:text-red-600"
                                        style={{
                                          fontSize: '64px',
                                          fontWeight: 'bold',
                                          color: '#dc2626',
                                          textShadow: '2px 2px 4px rgba(0,0,0,0.2)',
                                        }}
                                      >
                                        PAID
                                      </div>
                                    </div>
                                    <div className="relative z-10">
                                      <p className="text-muted-foreground">Total amount paid by</p>
                                      <p className="text-lg font-semibold">{payerName || 'Valued Customer'}</p>
                                      <p className="text-3xl font-bold tracking-tight">PKR {invoice.totalAmount.toLocaleString()}</p>
                                      {invoice.paidAt && (
                                        <>
                                          <p className="text-sm text-muted-foreground">on {format(toDateValue(invoice.paidAt) || new Date(), 'PPP')}</p>
                                          <p className="text-sm text-red-600 font-semibold mt-1">{format(toDateValue(invoice.paidAt) || new Date(), 'dd/MM/yyyy hh:mm a')}</p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                              </>
                          ) : (
                              <>
                                  <p className="text-muted-foreground">{payerName || 'Valued Customer'} is requested to pay</p>
                                  <p className="text-3xl font-bold tracking-tight">PKR {invoice.totalAmount.toLocaleString()}</p>
                                  <p className="text-sm text-muted-foreground">by the due date of</p>
                                  <p className="font-semibold">{format(toDateValue(invoice.periodEnd) || new Date(), 'PPP')}</p>
                              </>
                          )}
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
    <div className="max-w-3xl mx-auto bg-background p-2 sm:p-4 md:p-8 print:p-0 pos-receipt-container print:max-w-none print:mx-0">
      <div className="flex justify-end mb-2 sm:mb-4 no-print">
        <Button onClick={handlePrint} size="sm" className="text-xs sm:text-sm">
          <Printer className="mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Print Receipt
        </Button>
      </div>

      <div className="block print:p-0 print:shadow-none print:border-none print:text-[10px] print:leading-tight">
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
          {isPaid && invoice.paidAt && <p>Paid on: {format(toDateValue(invoice.paidAt) || new Date(), 'dd/MM/yyyy hh:mm a')}</p>}
          {!isPaid && <p className="font-semibold">Due Date: {format(toDateValue(invoice.periodEnd) || new Date(), 'dd/MM/yyyy')}</p>}
          <p>Billed To: {payerName || 'Valued Customer'}</p>
          {isPaid && <p>Paid by: {invoice.paidBy || 'N/A'}</p>}
        </div>

        <Separator className="my-2 print:border-dashed" />

        <div className="text-xs">
          <p className="font-semibold">
            For Period: {format(toDateValue(invoice.periodStart) || new Date(), 'dd/MM/yy')} - {format(toDateValue(invoice.periodEnd) || new Date(), 'dd/MM/yy')}
          </p>
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
            {devices.map(device => (
              <tr key={device.id} className={hasMultipleDevices ? "font-medium" : ""}>
                <td className="py-1">
                  Subscription: {device.name}
                  <div className="text-muted-foreground font-normal">IMEI: {maskImei(device.uniqueId)}</div>
                </td>
                <td className="text-right py-1">{getDeviceRenewalFee(device).toLocaleString()}</td>
              </tr>
            ))}
            
            {invoice.simCharges && invoice.simCharges > 0 ? (
              <tr className="border-t print:border-dashed">
                <td className="py-1">SIM Charges</td>
                <td className="text-right py-1">{invoice.simCharges.toLocaleString()}</td>
              </tr>
            ) : null}
            {invoice.otherCharges && invoice.otherCharges > 0 ? (
              <tr>
                <td className="py-1">Other Charges</td>
                <td className="text-right py-1">{invoice.otherCharges.toLocaleString()}</td>
              </tr>
            ) : null}
            {invoice.discount && invoice.discount > 0 ? (
              <tr>
                <td className="py-1">Discount</td>
                <td className="text-right py-1 text-green-600">-{invoice.discount.toLocaleString()}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="flex justify-end mt-2">
            <div className="w-full space-y-1 text-xs">
              <div className="flex justify-between font-semibold">
                <span>Total {isPaid ? 'Paid' : 'Due'}</span>
                <span>PKR {invoice.totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

        {isPaid ? (
          <div className="relative mt-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div 
                className="text-red-600 font-bold text-2xl transform -rotate-12 opacity-30 print:opacity-100 print:text-red-600"
                style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: '#dc2626',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.2)',
                }}
              >
                PAID
              </div>
            </div>
            <p className="text-center font-bold text-xs mt-2 relative z-10">-- PAID --</p>
            {invoice.paidAt && (
              <p className="text-center text-xs text-red-600 font-semibold mt-1 relative z-10">
                {format(invoice.paidAt, 'dd/MM/yyyy hh:mm a')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-center font-bold text-xs mt-2">-- PLEASE PAY BY DUE DATE --</p>
        )}
        
        <ReceiptFooter />
      </div>
    </div>
  );
}
