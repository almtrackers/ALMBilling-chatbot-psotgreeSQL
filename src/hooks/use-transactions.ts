'use client';

import { useMemo } from 'react';
import type { Device } from '@/lib/types';
import { useDevices } from './use-devices';
import { useInvoices } from './use-invoices';
import { useExpenses } from './use-expenses';
import { useSales } from './use-sales';
import { usePersons } from './use-persons';

export type Transaction = {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  source: 'invoice' | 'sale' | 'expense' | 'stock_purchase' | 'commission' | 'investment';
  status?: string;
};

export function useTransactions(limit?: number) {
  const { devices, isLoading: loadingDevices } = useDevices();
  const { invoicesWithDetails, isLoading: loadingInvoices } = useInvoices();
  const { expenses, isLoading: loadingExpenses } = useExpenses();
  const { sales, isLoading: loadingSales } = useSales();
  const { persons, isLoading: loadingPersons } = usePersons();
  
  const peopleMap = useMemo(() => {
    if (!persons || !Array.isArray(persons)) return new Map();
    return new Map(persons.map(p => [p.id, p.name]));
  }, [persons]);

  const transactions = useMemo(() => {
    const combined: Transaction[] = [];
    const deviceMap = new Map<number, Device>(Array.isArray(devices) ? devices.map(d => [d.id, d]) : []);

    // Map paid invoices to transactions
    if (Array.isArray(invoicesWithDetails)) {
      invoicesWithDetails
        .filter(detail => detail.invoice.status === 'paid' && detail.invoice.paidAt)
        .forEach(detail => {
        const invoice = detail.invoice;
        const deviceNames = detail.devices.map(d => d.name).join(', ') || 'Unknown Device';
        const description = `Invoice for ${deviceNames}`;

        combined.push({
          id: invoice.id,
          date: new Date(invoice.paidAt!),
          description: description,
          amount: invoice.totalAmount,
          type: 'income',
          source: 'invoice',
          status: 'Paid',
        });
      });
    }

    // Map sales to transactions (as income only)
    if (Array.isArray(sales)) {
      sales.forEach(sale => {
        combined.push({
          id: sale.id,
          date: new Date(sale.date),
          description: `Sale to ${sale.customerName} for ${sale.vehicleNumber}`,
          amount: Number(sale.amount),
          type: 'income',
          source: 'sale',
          status: 'Completed',
        });
        // If there's a commission, create a corresponding expense transaction
        if (sale.commission && Number(sale.commission) > 0) {
          combined.push({
              id: `${sale.id}-commission`,
              date: new Date(sale.date),
              description: `Commission for sale of ${sale.vehicleNumber}`,
              amount: Number(sale.commission),
              type: 'expense',
              source: 'commission',
              status: 'Paid'
          });
        }
      });
    }

    // Map expenses to transactions
    if (Array.isArray(expenses)) {
      expenses.forEach(expense => {
        let description = expense.title;
        let transactionType: 'income' | 'expense' = 'expense';
        let transactionSource: Transaction['source'] = 'expense';

      if (expense.type === 'stock_purchase') {
          transactionSource = 'stock_purchase';
      }

      if (expense.type === 'people_transaction') {
        const personName = expense.personId ? peopleMap.get(expense.personId) || 'Unknown Person' : 'Unknown Person';
        if (expense.transactionType === 'incoming') {
          transactionType = 'income';
          transactionSource = 'investment';
          description = `Investment from ${personName}`;
        } else {
            transactionType = 'expense';
            transactionSource = 'expense';
            description = `Pay to ${personName}`;
        }
      }

      combined.push({
        id: expense.id,
        date: new Date(expense.date),
        description: description,
        amount: Number(expense.amount),
        type: transactionType,
        source: transactionSource,
        status: expense.status,
      });
    });
    }

    // Sort all transactions by date, descending
    const sorted = combined.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    return limit ? sorted.slice(0, limit) : sorted;

  }, [invoicesWithDetails, expenses, sales, devices, peopleMap, limit]);

  const isLoading = loadingInvoices || loadingExpenses || loadingSales || loadingDevices || loadingPersons;

  return { transactions, isLoading };
}
