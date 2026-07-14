
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSubscriptionStats } from '@/hooks/use-subscription-stats';
import { ServerCrash, CalendarDays } from 'lucide-react';

const StatBox = ({
  title,
  value,
  count,
  period,
}: {
  title: string;
  value: string;
  count: number;
  period: string;
}) => (
  <div className="flex flex-col space-y-1 rounded-lg border p-4">
    <div className="text-sm text-muted-foreground">{title}</div>
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-muted-foreground">
      from {count} {period} subscriptions
    </div>
  </div>
);

export default function SubscriptionSummary() {
  const { stats, isLoading, isError } = useSubscriptionStats();

  if (isLoading) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle>Expected Subscription Revenue</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle>Expected Subscription Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load stats</AlertTitle>
            <AlertDescription>
              There was a problem fetching device data for projections.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Expected Subscription Revenue
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatBox
          title="This Year"
          value={`PKR ${stats.expectedYearlyRevenue.toLocaleString()}`}
          count={stats.yearlyCount}
          period="yearly"
        />
        <StatBox
          title="This Month"
          value={`PKR ${stats.expectedMonthlyRevenue.toLocaleString()}`}
          count={stats.monthlyCount}
          period="monthly"
        />
      </CardContent>
    </Card>
  );
}
