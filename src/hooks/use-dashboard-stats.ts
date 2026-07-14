
'use client';

import { useMemo } from 'react';
import { useTransactions, Transaction } from './use-transactions';

export function useDashboardStats() {
  const { transactions, isLoading: isLoadingTransactions } = useTransactions();

  const stats = useMemo(() => {
    const revenue =
      transactions
        .filter((tx) => tx.type === 'income' && tx.source !== 'investment')
        .reduce((acc, tx) => acc + tx.amount, 0) || 0;

    const expenses =
      transactions
        .filter((tx) => tx.type === 'expense')
        .reduce((acc, tx) => acc + tx.amount, 0) || 0;
    
    const profit = revenue - expenses;
    
    const investments = transactions.filter(tx => tx.source === 'investment');
    const totalInvestment = investments.reduce((acc, tx) => acc + tx.amount, 0);

    return {
      totalRevenue: revenue,
      totalExpenses: expenses,
      profit,
      totalInvestment,
      investments,
    };
  }, [transactions]);

  return { ...stats, isLoading: isLoadingTransactions };
}
