
'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportView from '@/components/dashboard/reports/report-view';
import { getYear, getMonth } from 'date-fns';

const years = Array.from({ length: 10 }, (_, i) => getYear(new Date()) - i);
const months = [
  { value: 0, label: 'January' }, { value: 1, label: 'February' },
  { value: 2, label: 'March' }, { value: 3, label: 'April' },
  { value: 4, label: 'May' }, { value: 5, label: 'June' },
  { value: 6, label: 'July' }, { value: 7, label: 'August' },
  { value: 8, label: 'September' }, { value: 9, label: 'October' },
  { value: 10, label: 'November' }, { value: 11, label: 'December' },
];


export type ReportPeriod = {
  year: number;
  month?: number; // 0-11 for monthly, undefined for yearly
};


export default function ReportsPage() {
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));

  const handleGenerateReport = () => {
    setReportPeriod({
      year: selectedYear,
      month: selectedMonth,
    });
  };
  
  const handleGenerateYearlyReport = () => {
     setReportPeriod({
      year: selectedYear,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Generate financial reports for specific periods."
      />
      <Card>
        <CardHeader>
          <CardTitle>Generate Monthly Report</CardTitle>
          <CardDescription>
            Select a month and year to generate a detailed financial summary.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-end gap-4">
          <div className="grid w-full sm:w-auto sm:grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-sm font-medium">Year</label>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                        {years.map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <label className="text-sm font-medium">Month</label>
                <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                        {months.map(month => (
                        <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          </div>
          <div className="flex w-full sm:w-auto gap-2">
            <Button onClick={handleGenerateReport} className="w-full">Generate Monthly</Button>
            <Button onClick={handleGenerateYearlyReport} variant="outline" className="w-full">Generate Yearly</Button>
          </div>
        </CardContent>
      </Card>
      
      {reportPeriod && <ReportView period={reportPeriod} />}

    </div>
  );
}
