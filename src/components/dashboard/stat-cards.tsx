
'use client';

import { DollarSign, Banknote, Smartphone, TrendingUp, PiggyBank } from 'lucide-react';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { useDevices } from '@/hooks/use-devices';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type StatCardsProps = {
  onInvestmentClick: () => void;
};

export default function StatCards({ onInvestmentClick }: StatCardsProps) {
  const {
    totalRevenue,
    totalExpenses,
    profit,
    totalInvestment,
    isLoading: isLoadingStats,
  } = useDashboardStats();
  const { devices, isLoading: isLoadingDevices } = useDevices();

  const activeDevices = devices?.length ?? 0;

  const stats = [
    {
      title: 'Net Profit',
      value: `PKR ${profit.toLocaleString()}`,
      icon: TrendingUp,
      description: 'Revenue minus expenses',
      color: profit >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Total Revenue',
      value: `PKR ${totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      description: 'From invoices and sales',
    },
    {
      title: 'Total Expenses',
      value: `PKR ${totalExpenses.toLocaleString()}`,
      icon: Banknote,
      description: 'All business expenses',
      color: 'text-red-600',
    },
     {
      title: 'Total Investment',
      value: `PKR ${totalInvestment.toLocaleString()}`,
      icon: PiggyBank,
      description: 'Capital from partners/employees',
      onClick: onInvestmentClick,
      isClickable: true,
    },
    {
      title: 'Active Devices',
      value: activeDevices,
      icon: Smartphone,
      description: 'Total devices on the server',
    },
  ];

  const isLoading = isLoadingStats || isLoadingDevices;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32 mb-1" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.title} onClick={stat.onClick} className={stat.isClickable ? 'cursor-pointer hover:bg-muted/50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stat.color || ''}`}>
              {stat.value}
            </div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
