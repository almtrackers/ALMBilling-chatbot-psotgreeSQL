
'use client';

import { useFinancialReport, ReportTransaction } from '@/hooks/use-financial-report';
import type { ReportPeriod } from '@/app/dashboard/reports/page';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ServerCrash, DollarSign, Banknote, TrendingUp, ArrowUpRight, ArrowDownLeft, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { toJsDate } from '@/lib/utils';

const StatCard = ({ title, value, icon: Icon, color }: { title: string; value: string; icon: React.ElementType; color?: string }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className={`text-2xl font-bold ${color || ''}`}>{value}</div>
    </CardContent>
  </Card>
);

const getTransactionIcon = (type: 'income' | 'expense') => {
  if (type === 'income') {
    return <ArrowUpRight className="h-4 w-4 text-green-500" />;
  }
  return <ArrowDownLeft className="h-4 w-4 text-red-500" />;
};

const formatTransactionSource = (source: ReportTransaction['source']) => {
    switch (source) {
      case 'invoice': return 'Invoice Payment';
      case 'sale': return 'Direct Sale';
      case 'expense': return 'Business Expense';
      case 'commission': return 'Dealer Commission';
      case 'stock_purchase': return 'Stock Purchase';
      case 'investment': return 'Investment in Business';
    }
};

export default function ReportView({ period }: { period: ReportPeriod }) {
  const { report, isLoading } = useFinancialReport(period);
  const { toast } = useToast();

  const handleExport = () => {
    if (!report || report.transactions.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Data to Export',
        description: 'There are no transactions in the generated report.',
      });
      return;
    }

    const header = ['id', 'date', 'description', 'type', 'source', 'amount'];
    const csvRows = [
      header.join(','),
      ...report.transactions.map((tx) => {
        const date = format(toJsDate(tx.date), 'yyyy-MM-dd HH:mm:ss');
        const description = `"${tx.description.replace(/"/g, '""')}"`;
        return [tx.id, date, description, tx.type, tx.source, tx.amount].join(',');
      }),
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const periodStr = period.month !== undefined ? `${period.year}-${String(period.month + 1).padStart(2, '0')}` : period.year;
    link.setAttribute('download', `financial-report-${periodStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!report) {
    return (
      <Alert variant="destructive">
        <ServerCrash className="h-4 w-4" />
        <AlertTitle>Error Generating Report</AlertTitle>
        <AlertDescription>Could not fetch or process financial data for the selected period.</AlertDescription>
      </Alert>
    );
  }

  const periodTitle = period.month !== undefined
    ? `${format(new Date(period.year, period.month), 'MMMM yyyy')}`
    : `the year ${period.year}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
            <h2 className="text-xl font-bold">Financial Report for {periodTitle}</h2>
            <p className="text-muted-foreground">A summary of income and expenses for the selected period.</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={report.transactions.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Revenue" value={`PKR ${report.totalRevenue.toLocaleString()}`} icon={DollarSign} color="text-green-600" />
        <StatCard title="Total Expenses" value={`PKR ${report.totalExpenses.toLocaleString()}`} icon={Banknote} color="text-red-600" />
        <StatCard title="Net Profit" value={`PKR ${report.netProfit.toLocaleString()}`} icon={TrendingUp} color={report.netProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
          <CardDescription>All recorded income and expenses for this period.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.transactions.length > 0 ? (
                report.transactions.map((tx) => (
                  <TableRow key={`${tx.source}-${tx.id}`}>
                    <TableCell>{format(toJsDate(tx.date), 'PP')}</TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTransactionIcon(tx.type)}
                        <span>{formatTransactionSource(tx.source)}</span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${tx.type === 'income' ? 'text-green-600' : 'text-destructive'}`}>
                      {tx.type === 'income' ? '+' : '-'} PKR {tx.amount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No transactions found for this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
