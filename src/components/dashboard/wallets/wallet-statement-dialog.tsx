'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Download, FileDown, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type StatementPeriod = {
  periodNumber: number;
  start: string;
  end: string;
  fee: number;
  status: 'free' | 'charged' | 'upcoming';
};

type StatementDevice = {
  id: number;
  traccarDeviceId: number;
  name: string;
  planType: string;
  planPrice: number;
  status: string;
  installationDate: string;
  nextBillingDate: string;
  chargedPeriods: number;
  chargedTotal: number;
  periods: StatementPeriod[];
};

type StatementTransaction = {
  id: number;
  deviceId: number | null;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
};

type StatementInvoice = {
  id: string;
  customerName: string;
  totalAmount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  paidBy: string | null;
  autoPaid: boolean;
  createdAt: string;
};

type Statement = {
  wallet: {
    id: number;
    traccarId: number | null;
    name: string;
    phone: string | null;
    email: string | null;
    status: string;
    balance: number;
  };
  summary: {
    totalDebits: number;
    totalCredits: number;
    balance: number;
    autoPaidTotal: number;
    pendingInvoicesTotal: number;
    deviceCount: number;
    transactionCount: number;
  };
  devices: StatementDevice[];
  transactions: StatementTransaction[];
  invoices: StatementInvoice[];
};

type Props = {
  userId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function money(value: number): string {
  return `PKR ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function WalletStatementDialog({ userId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/wallet/statement?userId=${userId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load statement');
      setStatement(data);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load statement',
      });
    } finally {
      setIsLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (open && userId) {
      setStatement(null);
      void load();
    }
  }, [open, userId, load]);

  const exportCsv = () => {
    if (!statement) return;
    const lines: string[] = [];
    const w = statement.wallet;
    const s = statement.summary;

    lines.push(`Wallet Statement,${csvEscape(w.name)}`);
    lines.push(`Generated,${format(new Date(), 'dd MMM yyyy HH:mm')}`);
    lines.push(`Traccar User ID,${w.traccarId ?? ''}`);
    lines.push(`Phone,${csvEscape(w.phone || '')}`);
    lines.push('');
    lines.push('SUMMARY');
    lines.push(`Total Subscription Charges (Debits),${s.totalDebits}`);
    lines.push(`Total Invoice Payments (Credits),${s.totalCredits}`);
    lines.push(`Current Balance,${s.balance}`);
    lines.push(`Auto-Paid Invoices Total,${s.autoPaidTotal}`);
    lines.push(`Pending Invoices Total,${s.pendingInvoicesTotal}`);
    lines.push('');

    lines.push('DEVICE SUBSCRIPTION SCHEDULE');
    lines.push('Device,Plan,Fee,Period #,Period Start,Period End,Charge,Status');
    for (const device of statement.devices) {
      for (const p of device.periods) {
        lines.push(
          [
            csvEscape(device.name),
            device.planType,
            device.planPrice,
            p.periodNumber,
            format(new Date(p.start), 'yyyy-MM-dd'),
            format(new Date(p.end), 'yyyy-MM-dd'),
            p.fee,
            p.status === 'free' ? 'free (first period)' : p.status,
          ].join(',')
        );
      }
    }
    lines.push('');

    lines.push('TRANSACTION HISTORY');
    lines.push('Date,Type,Description,Debit,Credit,Balance');
    for (const tx of statement.transactions) {
      lines.push(
        [
          format(new Date(tx.createdAt), 'yyyy-MM-dd HH:mm'),
          tx.type,
          csvEscape(tx.description),
          tx.type === 'debit' ? tx.amount : '',
          tx.type === 'credit' ? tx.amount : '',
          tx.balanceAfter,
        ].join(',')
      );
    }
    lines.push('');

    lines.push('INVOICES');
    lines.push('Invoice ID,Period Start,Period End,Amount,Status,Paid At,Paid By');
    for (const inv of statement.invoices) {
      lines.push(
        [
          inv.id,
          format(new Date(inv.periodStart), 'yyyy-MM-dd'),
          format(new Date(inv.periodEnd), 'yyyy-MM-dd'),
          inv.totalAmount,
          inv.autoPaid ? 'paid (auto from wallet)' : inv.status,
          inv.paidAt ? format(new Date(inv.paidAt), 'yyyy-MM-dd HH:mm') : '',
          csvEscape(inv.paidBy || ''),
        ].join(',')
      );
    }

    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-statement-${w.name.replace(/[^a-z0-9]+/gi, '-')}-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    if (!statement) return;
    setIsExportingPdf(true);

    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const logoDataUrl = await fetch('/logo.png')
        .then((response) => {
          if (!response.ok) throw new Error('Logo not found');
          return response.blob();
        })
        .then(
          (blob) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            })
        )
        .catch(() => null);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const w = statement.wallet;
      const s = statement.summary;
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 12;
      const cleanDescription = (description: string) =>
        description.replace(/\[(?:SUB|INV|AUTOPAY):[^\]]+\]\s*/g, '');
      const finalY = () =>
        ((doc as typeof doc & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
          20) + 8;

      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', margin, 7, 25, 25);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text('Al-Muhafiz Tracker (PVT) LTD', logoDataUrl ? 41 : margin, 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(37, 99, 235);
      doc.text('Helpline: +92 311 1133170', logoDataUrl ? 41 : margin, 21);
      doc.text('Website: almtrace.com  |  Email: hello@almtrace.com', logoDataUrl ? 41 : margin, 27);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text('Wallet Statement', pageWidth - margin, 15, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, pageWidth - margin, 22, {
        align: 'right',
      });
      doc.setDrawColor(191, 219, 254);
      doc.setLineWidth(0.6);
      doc.line(margin, 35, pageWidth - margin, 35);

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.text(`Customer: ${w.name}`, margin, 42);
      doc.text(`Traccar User ID: ${w.traccarId ?? 'N/A'}`, margin, 48);
      doc.text(`Phone: ${w.phone || 'N/A'}   Email: ${w.email || 'N/A'}`, margin + 75, 48);

      autoTable(doc, {
        startY: 54,
        head: [['Subscription Charges', 'Invoice Payments', 'Current Balance', 'Auto-Paid', 'Pending']],
        body: [[
          money(s.totalDebits),
          money(s.totalCredits),
          money(s.balance),
          money(s.autoPaidTotal),
          money(s.pendingInvoicesTotal),
        ]],
        theme: 'grid',
        styles: { fontSize: 9, halign: 'center' },
        headStyles: { fillColor: [30, 64, 175] },
      });

      let y = finalY();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Device Subscription Schedule', margin, y);
      y += 4;

      const deviceRows = statement.devices.flatMap((device) =>
        device.periods.map((period) => [
          device.name,
          `${device.planType} / ${money(device.planPrice)}`,
          String(period.periodNumber),
          format(new Date(period.start), 'dd MMM yyyy'),
          format(new Date(period.end), 'dd MMM yyyy'),
          period.fee ? money(period.fee) : '-',
          period.status === 'free' ? 'Free (first period)' : period.status,
        ])
      );
      autoTable(doc, {
        startY: y,
        head: [['Device', 'Plan', 'Period', 'Start', 'End', 'Charge', 'Status']],
        body: deviceRows.length ? deviceRows : [['No billing devices', '', '', '', '', '', '']],
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 1.8 },
        headStyles: { fillColor: [51, 65, 85] },
        margin: { left: margin, right: margin },
      });

      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Transaction History', margin, 15);
      autoTable(doc, {
        startY: 19,
        head: [['Date', 'Type', 'Description', 'Debit', 'Credit', 'Balance']],
        body: statement.transactions.length
          ? statement.transactions.map((tx) => [
              format(new Date(tx.createdAt), 'dd MMM yyyy HH:mm'),
              tx.type,
              cleanDescription(tx.description),
              tx.type === 'debit' ? money(tx.amount) : '',
              tx.type === 'credit' ? money(tx.amount) : '',
              money(tx.balanceAfter),
            ])
          : [['No transactions', '', '', '', '', '']],
        theme: 'striped',
        styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak' },
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 18 },
          2: { cellWidth: 120 },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 30, halign: 'right' },
        },
        margin: { left: margin, right: margin },
      });

      y = finalY();
      const pageHeight = doc.internal.pageSize.getHeight();
      if (y > pageHeight - 35) {
        doc.addPage();
        y = 15;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Invoices', margin, y);
      autoTable(doc, {
        startY: y + 4,
        head: [['Invoice ID', 'Period', 'Amount', 'Status', 'Paid At', 'Paid By']],
        body: statement.invoices.length
          ? statement.invoices.map((invoice) => [
              invoice.id,
              `${format(new Date(invoice.periodStart), 'dd MMM yy')} - ${format(new Date(invoice.periodEnd), 'dd MMM yy')}`,
              money(invoice.totalAmount),
              invoice.autoPaid ? 'Paid (wallet auto)' : invoice.status,
              invoice.paidAt ? format(new Date(invoice.paidAt), 'dd MMM yyyy HH:mm') : '-',
              invoice.paidBy || '-',
            ])
          : [['No invoices', '', '', '', '', '']],
        theme: 'striped',
        styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak' },
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: {
          0: { cellWidth: 58 },
          1: { cellWidth: 48 },
          2: { cellWidth: 32, halign: 'right' },
          3: { cellWidth: 35 },
          4: { cellWidth: 40 },
        },
        margin: { left: margin, right: margin },
      });

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(
          'Al-Muhafiz Tracker (PVT) LTD  |  Helpline: +92 311 1133170  |  almtrace.com',
          margin,
          doc.internal.pageSize.getHeight() - 6
        );
        doc.text(
          `Page ${page} of ${pageCount}`,
          pageWidth - margin,
          doc.internal.pageSize.getHeight() - 6,
          { align: 'right' }
        );
      }

      const safeName = w.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
      doc.save(`wallet-statement-${safeName}-${format(new Date(), 'yyyyMMdd')}.pdf`);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'PDF export failed',
        description: error instanceof Error ? error.message : 'Could not generate PDF',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const txBadge = (type: string) => {
    if (type === 'credit') return <Badge className="bg-green-600 hover:bg-green-600">Credit</Badge>;
    if (type === 'debit') return <Badge variant="destructive">Debit</Badge>;
    if (type === 'auto-pay') return <Badge variant="secondary">Auto-Pay</Badge>;
    return <Badge variant="outline">{type}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Wallet Statement {statement ? `— ${statement.wallet.name}` : ''}
          </DialogTitle>
          <DialogDescription>
            Complete calculation and history sheet: subscription charges per device, invoice
            payments, and running balance.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !statement ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading statement...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Charges (Debits)</div>
                  <div className="font-mono font-bold text-destructive">
                    {money(statement.summary.totalDebits)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Payments (Credits)</div>
                  <div className="font-mono font-bold text-green-600">
                    {money(statement.summary.totalCredits)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Balance</div>
                  <div
                    className={cn(
                      'font-mono font-bold',
                      statement.summary.balance < 0 ? 'text-destructive' : 'text-green-600'
                    )}
                  >
                    {money(statement.summary.balance)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Auto-Paid Invoices</div>
                  <div className="font-mono font-bold">{money(statement.summary.autoPaidTotal)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Pending Invoices</div>
                  <div className="font-mono font-bold text-amber-600">
                    {money(statement.summary.pendingInvoicesTotal)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <Button size="sm" onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
              <Button size="sm" onClick={exportPdf} disabled={isExportingPdf}>
                {isExportingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                Export PDF
              </Button>
            </div>

            <Tabs defaultValue="transactions">
              <TabsList>
                <TabsTrigger value="transactions">
                  Transactions ({statement.transactions.length})
                </TabsTrigger>
                <TabsTrigger value="devices">
                  Device Charges ({statement.devices.length})
                </TabsTrigger>
                <TabsTrigger value="invoices">Invoices ({statement.invoices.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="transactions">
                <ScrollArea className="h-[380px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            No transactions yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        [...statement.transactions].reverse().map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="whitespace-nowrap text-xs">
                              {format(new Date(tx.createdAt), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell>{txBadge(tx.type)}</TableCell>
                            <TableCell className="max-w-[380px] text-xs">
                              {tx.description.replace(/\[(?:SUB|INV|AUTOPAY):[^\]]+\]\s*/g, '')}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-mono text-sm',
                                tx.type === 'credit'
                                  ? 'text-green-600'
                                  : tx.type === 'debit'
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                              )}
                            >
                              {tx.type === 'credit' ? '+' : tx.type === 'debit' ? '-' : ''}
                              {tx.amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {tx.balanceAfter.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="devices">
                <ScrollArea className="h-[380px] rounded-md border">
                  <div className="space-y-4 p-3">
                    {statement.devices.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        No billing devices linked to this wallet.
                      </div>
                    ) : (
                      statement.devices.map((device) => (
                        <div key={device.id} className="rounded-md border">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                            <div>
                              <span className="font-medium">{device.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {device.planType} · {money(device.planPrice)} / period · installed{' '}
                                {format(new Date(device.installationDate), 'dd MMM yyyy')}
                              </span>
                            </div>
                            <div className="text-xs">
                              <Badge variant="outline">
                                {device.chargedPeriods} charged periods = {money(device.chargedTotal)}
                              </Badge>
                            </div>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">#</TableHead>
                                <TableHead>Period</TableHead>
                                <TableHead className="text-right">Charge</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {device.periods.map((p) => (
                                <TableRow key={p.periodNumber}>
                                  <TableCell className="text-xs">{p.periodNumber}</TableCell>
                                  <TableCell className="text-xs">
                                    {format(new Date(p.start), 'dd MMM yyyy')} →{' '}
                                    {format(new Date(p.end), 'dd MMM yyyy')}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {p.fee > 0 ? money(p.fee) : '—'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {p.status === 'free' ? (
                                      <Badge variant="secondary">Free (1st period)</Badge>
                                    ) : p.status === 'charged' ? (
                                      <Badge variant="destructive">Charged</Badge>
                                    ) : (
                                      <Badge variant="outline">Upcoming</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="invoices">
                <ScrollArea className="h-[380px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.invoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            No invoices found for this user.
                          </TableCell>
                        </TableRow>
                      ) : (
                        statement.invoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="whitespace-nowrap text-xs">
                              {format(new Date(inv.createdAt), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell className="text-xs">
                              {format(new Date(inv.periodStart), 'dd MMM yy')} →{' '}
                              {format(new Date(inv.periodEnd), 'dd MMM yy')}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {inv.totalAmount.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {inv.status === 'paid' ? (
                                inv.autoPaid ? (
                                  <Badge variant="secondary">Paid (wallet auto)</Badge>
                                ) : (
                                  <Badge className="bg-green-600 hover:bg-green-600">Paid</Badge>
                                )
                              ) : inv.status === 'pending' ? (
                                <Badge variant="destructive">Pending</Badge>
                              ) : (
                                <Badge variant="outline">{inv.status}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {inv.paidAt
                                ? `${format(new Date(inv.paidAt), 'dd MMM yyyy')}${inv.paidBy ? ` · ${inv.paidBy}` : ''}`
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
