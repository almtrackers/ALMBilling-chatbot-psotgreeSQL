
'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { Invoice, Expense, Sale, Person } from '@/lib/types';
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import type { ReportPeriod } from '@/app/dashboard/reports/page';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export type ReportTransaction = {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  source: 'invoice' | 'sale' | 'expense' | 'commission' | 'stock_purchase' | 'investment';
};

export function useFinancialReport(period: ReportPeriod | null) {
  const [startDate, endDate] = useMemo(() => {
    if (!period) return [null, null];
    if (period.month !== undefined) {
      const date = new Date(period.year, period.month);
      return [startOfMonth(date), endOfMonth(date)];
    }
    const date = new Date(period.year, 0);
    return [startOfYear(date), endOfYear(date)];
  }, [period]);

  const queryParams = useMemo(() => {
    if (!startDate || !endDate) return '';
    return `?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
  }, [startDate, endDate]);

  const { data: sales, isLoading: loadingSales } = useSWR<Sale[]>(
    startDate ? `/api/sales${queryParams}` : null,
    fetcher
  );
  
  const { data: expenses, isLoading: loadingExpenses } = useSWR<Expense[]>(
    startDate ? `/api/expenses${queryParams}` : null,
    fetcher
  );
  
  const { data: invoices, isLoading: loadingInvoices } = useSWR<Invoice[]>(
    startDate ? `/api/invoices${queryParams}` : null,
    fetcher
  );
  
  const { data: people, isLoading: loadingPeople } = useSWR<Person[]>('/api/people', fetcher);
  
  const peopleMap = useMemo(() => {
    if (!people) return new Map();
    return new Map(people.map(p => [p.id, p.name]));
  }, [people]);

  const report = useMemo(() => {
    if (!sales || !expenses || !invoices) {
      return { totalRevenue: 0, totalExpenses: 0, netProfit: 0, transactions: [] };
    }

    const transactions: ReportTransaction[] = [];
    let totalRevenue = 0;
    let totalExpenses = 0;

    sales.forEach(sale => {
      const saleAmount = Number(sale.amount);
      const saleCommission = sale.commission ? Number(sale.commission) : 0;
      const saleDate = new Date(sale.date);

      transactions.push({
        id: sale.id,
        date: saleDate,
        description: `Sale for ${sale.vehicleNumber}`,
        amount: saleAmount,
        type: 'income',
        source: 'sale',
      });
      totalRevenue += saleAmount;
      
      if (saleCommission > 0) {
        transactions.push({
            id: `${sale.id}-commission`,
            date: saleDate,
            description: `Commission for sale of ${sale.vehicleNumber}`,
            amount: saleCommission,
            type: 'expense',
            source: 'commission'
        });
        totalExpenses += saleCommission;
      }
    });

    expenses.forEach(expense => {
      const expenseAmount = Number(expense.amount);
      const expenseDate = new Date(expense.date);
      
      if (expense.status === 'approved') {
        let description = expense.title;
        let transactionType: 'income' | 'expense' = 'expense';
        let transactionSource: ReportTransaction['source'] = 'expense';

        if (expense.type === 'stock_purchase') {
            transactionSource = 'stock_purchase';
        }

        if (expense.type === 'people_transaction') {
            const personName = expense.personId ? peopleMap.get(expense.personId) || 'Unknown Person' : 'Unknown Person';
            description = `People Transaction: ${personName}`;
            if (expense.transactionType === 'incoming') {
                transactionType = 'income';
                transactionSource = 'investment';
            }
        }
        
        if (transactionType === 'income') {
            totalRevenue += expenseAmount;
        } else {
            totalExpenses += expenseAmount;
        }

        transactions.push({
          id: expense.id,
          date: expenseDate,
          description: description,
          amount: expenseAmount,
          type: transactionType,
          source: transactionSource,
        });
      }
    });

    invoices.forEach(invoice => {
      if (invoice.status === 'paid' && invoice.paidAt) {
        const invoiceAmount = Number(invoice.totalAmount);
        const invoicePaidAt = new Date(invoice.paidAt);

        transactions.push({
          id: invoice.id,
          date: invoicePaidAt,
          description: `Invoice for ${invoice.customerName}`,
          amount: invoiceAmount,
          type: 'income',
          source: 'invoice',
        });
        totalRevenue += invoiceAmount;
      }
    });

    // Sort transactions by date descending
    transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      transactions,
    };
  }, [sales, expenses, invoices, peopleMap]);

  return {
    ...report,
    isLoading: loadingSales || loadingExpenses || loadingInvoices || loadingPeople,
  };
}
