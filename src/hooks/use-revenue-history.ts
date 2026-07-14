
'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { Invoice, Sale } from '@/lib/types';
import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, parseISO } from 'date-fns';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useRevenueHistory() {
  const { data: paidInvoices, isLoading: loadingInvoices, error: errorInvoices } = useSWR<Invoice[]>('/api/invoices?status=paid', fetcher);
  const { data: sales, isLoading: loadingSales, error: errorSales } = useSWR<Sale[]>('/api/sales', fetcher);

  const stats = useMemo(() => {
    let lastMonthRevenue = 0;
    let lastYearRevenue = 0;
    
    const today = new Date();
    const startOfLastMonth = startOfMonth(subMonths(today, 1));
    const endOfLastMonth = endOfMonth(subMonths(today, 1));
    const startOfLastYear = startOfYear(subYears(today, 1));
    const endOfLastYear = endOfYear(subYears(today, 1));

    if (paidInvoices && Array.isArray(paidInvoices)) {
      paidInvoices.forEach((invoice) => {
        if (invoice.paidAt) {
          const paidDate = typeof invoice.paidAt === 'string' ? parseISO(invoice.paidAt) : new Date(invoice.paidAt);
          
          // Check for Last Year
          if (paidDate >= startOfLastYear && paidDate <= endOfLastYear) {
            lastYearRevenue += Number(invoice.totalAmount);
          }
          
          // Check for Last Month
          if (paidDate >= startOfLastMonth && paidDate <= endOfLastMonth) {
            lastMonthRevenue += Number(invoice.totalAmount);
          }
        }
      });
    }

    if (sales && Array.isArray(sales)) {
      sales.forEach((sale) => {
        if (sale.date) {
          const saleDate = typeof sale.date === 'string' ? parseISO(sale.date) : new Date(sale.date);
          
          // Check for Last Year
          if (saleDate >= startOfLastYear && saleDate <= endOfLastYear) {
            lastYearRevenue += Number(sale.amount);
          }
          
          // Check for Last Month
          if (saleDate >= startOfLastMonth && saleDate <= endOfLastMonth) {
            lastMonthRevenue += Number(sale.amount);
          }
        }
      });
    }

    return {
      lastMonthRevenue,
      lastYearRevenue,
    };
  }, [paidInvoices, sales]);

  const isLoading = loadingInvoices || loadingSales;
  const isError = errorInvoices || errorSales;

  return { ...stats, isLoading, isError };
}

