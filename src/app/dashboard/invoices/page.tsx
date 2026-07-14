
'use client';

import { useState, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Calendar as CalendarIcon, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import CreateInvoiceForm from '@/components/dashboard/invoices/create-invoice-form';
import InvoiceList from '@/components/dashboard/invoices/invoice-list';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import QRCodeScanner from '@/components/ui/qr-code-scanner';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import InvoiceGenerationWarnings from '@/components/dashboard/invoices/invoice-generation-warnings';
import AccountHolderFilter from '@/components/dashboard/shared/account-holder-filter';
import { useInvoices } from '@/hooks/use-invoices';
import { getInvoiceAccountHolderOptions } from '@/lib/account-holder-filter-utils';
import { Combobox } from '@/components/ui/combobox';

export default function InvoicesPage() {
  const { isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string[]>(['all']);
  const [accountHolderFilter, setAccountHolderFilter] = useState('all');
  const [paidByFilter, setPaidByFilter] = useState('all');
  const { invoicesWithDetails } = useInvoices();

  const accountHolderOptions = useMemo(
    () => getInvoiceAccountHolderOptions(invoicesWithDetails?.map(({ invoice }) => invoice)),
    [invoicesWithDetails]
  );

  const paidByOptions = useMemo(() => {
    if (!invoicesWithDetails) return [];
    const names = new Set<string>();
    invoicesWithDetails.forEach(({ invoice }) => {
      if (invoice.paidBy) {
        names.add(invoice.paidBy);
      }
    });
    return Array.from(names).sort();
  }, [invoicesWithDetails]);

  const handleScan = (scannedText: string) => {
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

  const clearFilters = () => {
    setSearchTerm('');
    setDateRange(undefined);
    setDatePreset('all');
    setStatusFilter(['all']);
    setAccountHolderFilter('all');
    setPaidByFilter('all');
  };

  const hasActiveFilters = !!searchTerm || !!dateRange || (statusFilter.length > 0 && !statusFilter.includes('all')) || accountHolderFilter !== 'all' || paidByFilter !== 'all';

  return (
    <div className="space-y-6">
      <PageHeader
        className="no-print"
        title="Invoices"
        description="View and manage all customer invoices."
      >
        {isAdmin && (
           <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Manual Invoice</DialogTitle>
                <DialogDescription>
                  Select a device to generate a new invoice. The financial details will be pulled from the device's attributes in Traccar.
                </DialogDescription>
              </DialogHeader>
              <CreateInvoiceForm setDialogOpen={setIsDialogOpen} />
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>
      
       <InvoiceGenerationWarnings className="no-print" />

       <Card className="no-print">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                <div className="relative">
                    <label className="text-sm font-medium">Search</label>
                    <Search className="absolute left-2.5 top-9 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="By Customer, Device, or ID..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
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
                        <PopoverContent className="w-auto p-0" align="start">
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
                <div>
                  <label className="text-sm font-medium">Account Holder</label>
                  <AccountHolderFilter
                    value={accountHolderFilter}
                    onChange={setAccountHolderFilter}
                    options={accountHolderOptions}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Combobox
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'paid', label: 'Paid' },
                      { value: 'expired', label: 'Expired' },
                      { value: 'rolled-over', label: 'Rolled Over' },
                      { value: 'extension_expired', label: 'Extension Expired' },
                    ]}
                    isMultiSelect
                    selectedValues={statusFilter}
                    onChange={(value) => {
                      if (value === 'all') {
                        setStatusFilter(['all']);
                      } else {
                        const newFilters = statusFilter.filter(f => f !== 'all');
                        if (newFilters.includes(value)) {
                          const updated = newFilters.filter(f => f !== value);
                          setStatusFilter(updated.length === 0 ? ['all'] : updated);
                        } else {
                          setStatusFilter([...newFilters, value]);
                        }
                      }
                    }}
                    placeholder="Select statuses..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Paid By</label>
                  <Select value={paidByFilter} onValueChange={setPaidByFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by paid by..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {paidByOptions.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

      <InvoiceList
        searchTerm={searchTerm}
        dateRange={dateRange}
        statusFilter={statusFilter}
        accountHolderFilter={accountHolderFilter}
        paidByFilter={paidByFilter}
      />
    </div>
  );
}
