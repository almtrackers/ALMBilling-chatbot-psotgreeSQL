
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useRevenueHistory } from '@/hooks/use-revenue-history';
import { History, ServerCrash } from 'lucide-react';

const StatBox = ({ title, value }: { title: string; value: string }) => (
  <div className="flex flex-col space-y-1 rounded-lg border p-4">
    <div className="text-sm text-muted-foreground">{title}</div>
    <div className="text-2xl font-bold">{value}</div>
  </div>
);

export default function RevenueHistory() {
  const { lastMonthRevenue, lastYearRevenue, isLoading, isError } = useRevenueHistory();

  if (isLoading) {
    return (
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle>Revenue History</CardTitle>
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
          <CardTitle>Revenue History</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load revenue history</AlertTitle>
            <AlertDescription>
              There was a problem fetching your invoice and sales data.
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
          <History className="h-5 w-5 text-primary" />
          Revenue History
        </CardTitle>
         <CardDescription>
          Income from all paid invoices and sales.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatBox
          title="Last Month"
          value={`PKR ${lastMonthRevenue.toLocaleString()}`}
        />
        <StatBox
          title="Last Year"
          value={`PKR ${lastYearRevenue.toLocaleString()}`}
        />
      </CardContent>
    </Card>
  );
}
