
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownLeft, FileText } from 'lucide-react';
import { useTransactions, Transaction } from '@/hooks/use-transactions';
import { toJsDate } from '@/lib/utils';

export default function TransactionList() {
  const { transactions, isLoading } = useTransactions(10); // Get last 10 transactions

  const getTransactionIcon = (type: 'income' | 'expense') => {
    if (type === 'income') {
      return <ArrowUpRight className="h-4 w-4 text-green-500" />;
    }
    return <ArrowDownLeft className="h-4 w-4 text-red-500" />;
  };
  
  const formatTransactionSource = (source: Transaction['source']) => {
    switch (source) {
      case 'invoice': return 'Invoice Payment';
      case 'sale': return 'Direct Sale';
      case 'expense': return 'Business Expense';
      case 'commission': return 'Dealer Commission';
      case 'stock_purchase': return 'Stock Purchase';
      case 'investment': return 'Investment in Business';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Loading your latest financial activities...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>
          A log of your most recent financial activities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions && transactions.length > 0 ? (
              transactions.map((tx) => (
                <TableRow key={`${tx.source}-${tx.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTransactionIcon(tx.type)}
                      <span className="font-medium">{formatTransactionSource(tx.source)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {tx.description}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(toJsDate(tx.date), 'PP')}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${tx.type === 'income' ? 'text-green-600' : 'text-destructive'}`}>
                    {tx.type === 'income' ? '+' : '-'} PKR {tx.amount.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <p>No transactions found.</p>
                    <p className="text-xs">
                      Paid invoices, sales, and expenses will appear here.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
