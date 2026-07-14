'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Upload, Calendar as CalendarIcon, X, Download, ChevronDown, Contact, Smartphone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import AddSaleForm from '@/components/dashboard/sales/add-sale-form';
import { Input } from '@/components/ui/input';
import SalesList from '@/components/dashboard/sales/sales-list';
import ImportSalesDialog from '@/components/dashboard/sales/import-sales-dialog';
import { useDealers } from '@/hooks/use-dealers';
import { useSales } from '@/hooks/use-sales';
import type { Dealer, Sale } from '@/lib/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from '@/components/ui/select';
import QRCodeScanner from '@/components/ui/qr-code-scanner';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  buildAlertNumbersCsv,
  buildAllAgentContactsCsv,
  buildAllAgentContactsVcf,
  buildPersonContactsCsv,
  buildPersonContactsVcf,
  buildTrackerSimContactsCsv,
  buildTrackerSimContactsVcf,
  downloadTextFile,
  getAllAgentContactRows,
  getPersonContactRows,
  getTrackerSimContactRows,
} from '@/lib/sales-export';

export default function SalesPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dealerFilter, setDealerFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<string>('all');
  const { dealers, isLoading: isLoadingDealers } = useDealers();
  const { sales: allSales } = useSales();
  const { toast } = useToast();
  
  const handleScan = (scannedText: string) => {
    // Assuming the format is "Sale Receipt\n#SALE_ID"
    const lines = scannedText.split('\n');
    if (lines.length > 1 && lines[1].startsWith('#')) {
      const id = lines[1].substring(1);
      setSearchTerm(id);
    } else {
      setSearchTerm(scannedText);
    }
  };
  
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    switch (preset) {
        case 'current_month':
            setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
            break;
        case 'last_month':
            const lastMonth = subMonths(now, 1);
            setDateRange({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
            break;
        case 'current_year':
            setDateRange({ from: startOfYear(now), to: endOfYear(now) });
            break;
        case 'last_year':
            const lastYear = subYears(now, 1);
            setDateRange({ from: startOfYear(lastYear), to: endOfYear(lastYear) });
            break;
        case 'all':
        default:
            setDateRange(undefined);
            break;
    }
  }

  const handleExport = (
    type:
      | 'all-vcf'
      | 'person-vcf'
      | 'sim-vcf'
      | 'all-csv'
      | 'person-csv'
      | 'sim-csv'
      | 'alerts-csv'
  ) => {
    if (!allSales || allSales.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Data to Export',
        description: 'There are no sales records to export.',
      });
      return;
    }

    const dateStr = format(new Date(), 'yyyy-MM-dd');

    if (type === 'all-vcf') {
      const rows = getAllAgentContactRows(allSales);
      if (rows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Contacts Found',
          description: 'No person or tracker SIM numbers were found in sales records.',
        });
        return;
      }
      downloadTextFile(
        buildAllAgentContactsVcf(allSales),
        `all-agent-contacts-android-${dateStr}.vcf`,
        'text/vcard;charset=utf-8'
      );
      toast({
        title: 'All Agent Contacts Exported',
        description: `${rows.length} contact(s) with [PERSON] and [TRACKER SIM] labels ready for Android import.`,
      });
      return;
    }

    if (type === 'person-vcf') {
      const rows = getPersonContactRows(allSales);
      if (rows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Person Numbers Found',
          description: 'No customer contact or alert numbers were found in sales records.',
        });
        return;
      }
      downloadTextFile(
        buildPersonContactsVcf(allSales),
        `person-contacts-android-${dateStr}.vcf`,
        'text/vcard;charset=utf-8'
      );
      toast({
        title: 'Person Contacts Exported',
        description: `${rows.length} person number(s) labeled [PERSON] for caller recognition on Android.`,
      });
      return;
    }

    if (type === 'sim-vcf') {
      const rows = getTrackerSimContactRows(allSales);
      if (rows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Tracker SIM Numbers Found',
          description: 'No tracker SIM numbers were found in sales records.',
        });
        return;
      }
      downloadTextFile(
        buildTrackerSimContactsVcf(allSales),
        `tracker-sim-contacts-android-${dateStr}.vcf`,
        'text/vcard;charset=utf-8'
      );
      toast({
        title: 'Tracker SIM Contacts Exported',
        description: `${rows.length} tracker SIM(s) labeled [TRACKER SIM] so agents know these are device numbers.`,
      });
      return;
    }

    if (type === 'all-csv') {
      const rows = getAllAgentContactRows(allSales);
      if (rows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Contacts Found',
          description: 'No person or tracker SIM numbers were found in sales records.',
        });
        return;
      }
      downloadTextFile(
        buildAllAgentContactsCsv(allSales),
        `all-agent-contacts-${dateStr}.csv`,
        'text/csv;charset=utf-8'
      );
      toast({
        title: 'All Agent Contacts CSV Exported',
        description: `${rows.length} row(s) with Number Type column for person vs tracker SIM.`,
      });
      return;
    }

    if (type === 'person-csv') {
      const rows = getPersonContactRows(allSales);
      if (rows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Person Numbers Found',
          description: 'No customer contact or alert numbers were found in sales records.',
        });
        return;
      }
      downloadTextFile(
        buildPersonContactsCsv(allSales),
        `person-contacts-${dateStr}.csv`,
        'text/csv;charset=utf-8'
      );
      toast({
        title: 'Person Contacts CSV Exported',
        description: `${rows.length} person number(s) exported with Number Type column.`,
      });
      return;
    }

    if (type === 'sim-csv') {
      const rows = getTrackerSimContactRows(allSales);
      if (rows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Tracker SIM Numbers Found',
          description: 'No tracker SIM numbers were found in sales records.',
        });
        return;
      }
      downloadTextFile(
        buildTrackerSimContactsCsv(allSales),
        `tracker-sim-contacts-${dateStr}.csv`,
        'text/csv;charset=utf-8'
      );
      toast({
        title: 'Tracker SIM CSV Exported',
        description: `${rows.length} tracker SIM row(s) with linked person number for texting decisions.`,
      });
      return;
    }

    downloadTextFile(
      buildAlertNumbersCsv(allSales),
      `alert-numbers-export-${dateStr}.csv`,
      'text/csv;charset=utf-8'
    );
    toast({
      title: 'Alert Numbers Exported',
      description: 'Alert numbers CSV download has started.',
    });
  };
  
  const clearFilters = () => {
    setSearchTerm('');
    setDealerFilter('all');
    setDateRange(undefined);
    setDatePreset('all');
  };

  const hasActiveFilters = searchTerm || dealerFilter !== 'all' || dateRange;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sale"
      >
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Android Agent Exports (.vcf)</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleExport('all-vcf')}>
                <Contact className="mr-2 h-4 w-4" />
                All Contacts (Person + Tracker SIM)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('person-vcf')}>
                <Contact className="mr-2 h-4 w-4" />
                Person Numbers Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('sim-vcf')}>
                <Smartphone className="mr-2 h-4 w-4" />
                Tracker SIM Numbers Only
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>CSV Exports</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleExport('all-csv')}>
                All Contacts with Number Type
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('person-csv')}>
                Person Numbers (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('sim-csv')}>
                Tracker SIM Numbers (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('alerts-csv')}>
                Alert Numbers (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Import Sales
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Sales from CSV</DialogTitle>
                <DialogDescription>
                  Upload a CSV file to bulk-add sales records.
                </DialogDescription>
              </DialogHeader>
              <ImportSalesDialog setDialogOpen={setIsImportDialogOpen} />
            </DialogContent>
          </Dialog>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Sale
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Add New Sale</DialogTitle>
                <DialogDescription>
                  Register a new device in Traccar and record the sale details.
                </DialogDescription>
              </DialogHeader>
              <AddSaleForm setDialogOpen={setIsAddDialogOpen} />
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

       <Card>
        <CardHeader>
            <div className="flex items-center gap-2">
                <QRCodeScanner
                    onScan={handleScan}
                    buttonText=""
                    className="h-9 w-9"
                />
                <CardTitle>Filters & Search</CardTitle>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
                <div className="relative">
                    <label className="text-sm font-medium">Search</label>
                    <Search className="absolute left-2.5 top-9 h-4 w-4 text-muted-foreground" />
                    <Input
                    type="search"
                    placeholder="By vehicle, customer, or ID..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Dealer</label>
                     <Select value={dealerFilter} onValueChange={setDealerFilter} disabled={isLoadingDealers}>
                        <SelectTrigger>
                        <SelectValue placeholder="Filter by dealer..." />
                        </SelectTrigger>
                        <SelectContent>
                        <SelectItem value="all">All Sales</SelectItem>
                        <SelectItem value="direct">Direct Sales Only</SelectItem>
                        {dealers?.map(dealer => (
                            <SelectItem key={dealer.id} value={dealer.id}>{dealer.name}</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                </div>
                 <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-sm font-medium">Date Range</label>
                        <Select value={datePreset} onValueChange={handleDatePresetChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select period..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Time</SelectItem>
                                <SelectItem value="current_month">Current Month</SelectItem>
                                <SelectItem value="last_month">Last Month</SelectItem>
                                <SelectItem value="current_year">Current Year</SelectItem>
                                <SelectItem value="last_year">Last Year</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div>
                        <label className="text-sm font-medium">Custom Date</label>
                        <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                                "w-full justify-start text-left font-normal",
                                !dateRange && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                <>
                                    {format(dateRange.from, "LLL dd, y")} -{" "}
                                    {format(dateRange.to, "LLL dd, y")}
                                </>
                                ) : (
                                format(dateRange.from, "LLL dd, y")
                                )
                            ) : (
                                <span>Pick a date</span>
                            )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" align="start">
                            <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={(range) => { setDateRange(range); setDatePreset('custom'); }}
                            numberOfMonths={2}
                            />
                        </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>
            {hasActiveFilters && (
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={clearFilters} className="h-10">
                        <X className="mr-2 h-4 w-4" />
                        Clear Filters
                    </Button>
                </div>
            )}
        </CardContent>
       </Card>

      <SalesList searchTerm={searchTerm} dealerFilter={dealerFilter} dateRange={dateRange} />
    </div>
  );
}
