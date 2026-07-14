'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useBillingHealth } from '@/hooks/use-billing-health';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, FileText, Loader2, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useFirebaseServices } from '@/hooks/use-firebase-services';
import { useToast } from '@/hooks/use-toast';
import { createInvoiceFromInstallationDate } from '@/lib/invoice-service';
import { addLog } from '@/lib/log-service';
import { useDevices } from '@/hooks/use-devices';
import EditDeviceAttributesDialog from '@/components/dashboard/billing-health/edit-device-attributes-dialog';
import BillingBreakdownDialog from '@/components/dashboard/billing-health/billing-breakdown-dialog';
import type { Device } from '@/lib/types';
import type { BillingHistoryRow } from '@/hooks/use-billing-health';
import { Combobox } from '@/components/ui/combobox';

const DEVICES_PER_PAGE = 10;

export default function BillingHistoryPage() {
  const { rows, isLoading } = useBillingHealth();
  const { user, isAdmin } = useAuth();
  const { db } = useFirebaseServices();
  const { devices } = useDevices();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState<string[]>(['all']);
  const [currentPage, setCurrentPage] = useState(1);
  const [generatingInvoiceForUserId, setGeneratingInvoiceForUserId] = useState<number | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBreakdownDialogOpen, setIsBreakdownDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedRow, setSelectedRow] = useState<BillingHistoryRow | null>(null);
  const [selectedWarnings, setSelectedWarnings] = useState<string[]>([]);

  const clientOptions = useMemo(() => {
    if (!rows) return [{ value: 'all', label: 'All Clients' }];
    
    const uniqueClients = new Map<number, { name: string, username: string }>();
    rows.forEach(row => {
      if (row.userId) {
        uniqueClients.set(row.userId, { name: row.customerName, username: row.username });
      }
    });

    const options = Array.from(uniqueClients.entries())
      .map(([id, info]) => ({
        value: id.toString(),
        label: `${info.username} - ${info.name}`
      }))
      .sort((a, b) => a.label.localeCompare(b));

    return [{ value: 'all', label: 'All Clients' }, ...options];
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    
    let filtered = rows;

    // Search term filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(row =>
        row.customerName.toLowerCase().includes(searchLower) ||
        row.deviceName.toLowerCase().includes(searchLower) ||
        row.customerContact.toLowerCase().includes(searchLower) ||
        row.username.toLowerCase().includes(searchLower)
      );
    }

    // Client filter (combined username and customer name)
    if (clientFilter && !clientFilter.includes('all')) {
      const selectedIds = clientFilter.map(Number);
      filtered = filtered.filter(row => row.userId && selectedIds.includes(row.userId));
    }

    return filtered;
  }, [rows, searchTerm, clientFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, clientFilter]);

  const clearFilters = () => {
    setSearchTerm('');
    setClientFilter(['all']);
  };

  const hasActiveFilters = !!searchTerm || (clientFilter.length > 0 && !clientFilter.includes('all'));

  const totals = useMemo(() => {
    return filteredRows.reduce((acc, row) => {
      // Only include rows that have valid billing data (installation date and renewal fee)
      const hasBillingData = row.installationDate && row.renewalFee > 0;
      if (!hasBillingData) return acc;

      return {
        expected: acc.expected + row.expectedAmount,
        paid: acc.paid + row.paidAmount,
        remaining: acc.remaining + row.remainingAmount,
      };
    }, { expected: 0, paid: 0, remaining: 0 });
  }, [filteredRows]);

  // Paginate filtered rows (already sorted by remaining amount descending)
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * DEVICES_PER_PAGE;
    return filteredRows.slice(startIndex, startIndex + DEVICES_PER_PAGE);
  }, [filteredRows, currentPage]);

  const totalPages = Math.ceil(filteredRows.length / DEVICES_PER_PAGE);

  const handleGenerateMissingInvoice = async (userId: number | null, customerName: string) => {
    if (!db || !user || !isAdmin) {
      toast({
        variant: 'destructive',
        title: 'Not Allowed',
        description: 'You must be an admin to generate invoices.',
      });
      return;
    }

    if (!userId) {
      toast({
        variant: 'destructive',
        title: 'User Not Found',
        description: 'Cannot determine the customer for this device.',
      });
      return;
    }

    setGeneratingInvoiceForUserId(userId);
    try {
      const result = await createInvoiceFromInstallationDate(db, userId, user.name);

      if (result.invoiceId) {
        toast({
          title: 'Invoice Created',
          description: `Cumulative invoice #${result.invoiceId} for PKR ${result.amount.toLocaleString()} created for ${result.customerName}.`,
        });
      } else {
        toast({
          title: 'No Invoice Needed',
          description: `No outstanding balance found for ${customerName} at this time.`,
        });
      }
    } catch (error: any) {
      console.error('Failed to create invoice:', error);
      toast({
        variant: 'destructive',
        title: 'Creation Failed',
        description: error.message || 'Could not create invoice.',
      });
    } finally {
      setGeneratingInvoiceForUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing History</h1>
          <p className="text-muted-foreground">
            Track device billing history and detect discrepancies.
          </p>
        </div>
        {!isLoading && filteredRows.length > 0 && (
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg border">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-bold">Total Expected</p>
              <p className="text-lg font-semibold">PKR {totals.expected.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-bold">Total Paid</p>
              <p className="text-lg font-semibold text-green-600">PKR {totals.paid.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-bold">Total Remaining</p>
              <p className={`text-lg font-bold ${totals.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                PKR {totals.remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No devices found.</div>
        ) : (
          <>
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
                <div className="relative">
                  <label className="text-sm font-medium mb-1.5 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search name, username, contact..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Client (Username - Name)</label>
                  <Combobox
                    options={clientOptions}
                    isMultiSelect
                    selectedValues={clientFilter}
                    onChange={(value) => {
                      if (value === 'all') {
                        setClientFilter(['all']);
                      } else {
                        const newFilters = clientFilter.filter(f => f !== 'all');
                        if (newFilters.includes(value)) {
                          const updated = newFilters.filter(f => f !== value);
                          setClientFilter(updated.length === 0 ? ['all'] : updated);
                        } else {
                          setClientFilter([...newFilters, value]);
                        }
                      }
                    }}
                    placeholder="Select clients..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <Button variant="ghost" onClick={clearFilters} className="h-10">
                      <X className="mr-2 h-4 w-4" />
                      Clear Filters
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                {hasActiveFilters ? (
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredRows.length} of {rows.length} devices
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Total: {rows.length} devices
                  </p>
                )}
                {filteredRows.length > DEVICES_PER_PAGE && (
                  <p className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </p>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Client (Username - Name)</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Installation Date</TableHead>
                    <TableHead>Period Type</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Warnings</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 10 : 9} className="text-center text-muted-foreground py-8">
                        {filteredRows.length === 0 ? 'No devices match your search.' : 'No devices on this page.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {paginatedRows.map((row) => (
                        <TableRow key={row.deviceId}>
                          <TableCell className="font-medium">
                            <button
                              className="text-primary hover:underline font-semibold text-left"
                              onClick={() => {
                                setSelectedRow(row);
                                setIsBreakdownDialogOpen(true);
                              }}
                            >
                              {row.deviceName}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{row.customerName}</span>
                              <span className="text-xs text-muted-foreground">{row.username}</span>
                            </div>
                          </TableCell>
                          <TableCell>{row.customerContact}</TableCell>
                          <TableCell>
                            {row.installationDate ? format(row.installationDate, 'PP') : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {row.renewalFee > 0 ? (
                              <Badge variant={row.periodType === 'yearly' ? 'default' : 'secondary'}>
                                {row.periodType}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.installationDate && row.renewalFee > 0 ? (
                              row.expectedAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.installationDate && row.renewalFee > 0 ? (
                              <span className={row.remainingAmount > 0 ? 'text-red-600 font-semibold' : row.remainingAmount < 0 ? 'text-green-600 font-semibold' : ''}>
                                {row.remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.warnings.length ? (
                              <div className="flex flex-wrap gap-1">
                                {row.warnings.map((w) => (
                                  <Badge 
                                    key={w} 
                                    variant="destructive" 
                                    className="text-xs cursor-pointer hover:opacity-80"
                                    onClick={() => {
                                      const device = devices.find(d => d.id === row.deviceId);
                                      if (device) {
                                        setSelectedDevice(device);
                                        setSelectedWarnings(row.warnings);
                                        setIsEditDialogOpen(true);
                                      }
                                    }}
                                  >
                                    {w}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Clear</Badge>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const device = devices.find(d => d.id === row.deviceId);
                                    if (device) {
                                      setSelectedDevice(device);
                                      setSelectedWarnings(row.warnings);
                                      setIsEditDialogOpen(true);
                                    }
                                  }}
                                >
                                  Edit
                                </Button>
                                {row.remainingAmount > 0 && row.userId && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={generatingInvoiceForUserId === row.userId}
                                    onClick={async () => {
                                      if (!db || !user) return;
                                      setGeneratingInvoiceForUserId(row.userId);
                                      try {
                                        await createInvoiceFromInstallationDate(db, row.userId, user.name);
                                        toast({
                                          title: "Invoice Generated",
                                          description: `Pending invoice created for ${row.customerName}.`,
                                        });
                                      } catch (error: any) {
                                        toast({
                                          variant: "destructive",
                                          title: "Error",
                                          description: error.message || "Failed to generate invoice",
                                        });
                                      } finally {
                                        setGeneratingInvoiceForUserId(null);
                                      }
                                    }}
                                  >
                                    {generatingInvoiceForUserId === row.userId ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Invoice
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      {/* Summary Row */}
                      <TableRow className="bg-muted/30 font-bold border-t-2">
                        <TableCell colSpan={5} className="text-right py-4">PAGE TOTALS</TableCell>
                        <TableCell className="text-right font-mono">
                          {paginatedRows.reduce((sum, r) => (r.installationDate && r.renewalFee > 0 ? sum + r.expectedAmount : sum), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          {paginatedRows.reduce((sum, r) => (r.installationDate && r.renewalFee > 0 ? sum + r.paidAmount : sum), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {paginatedRows.reduce((sum, r) => (r.installationDate && r.renewalFee > 0 ? sum + r.remainingAmount : sum), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell colSpan={isAdmin ? 2 : 1}></TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-end space-x-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
      <EditDeviceAttributesDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        device={selectedDevice}
        warnings={selectedWarnings}
        onSuccess={() => {
          // Optionally refresh data here if needed
          // The WebSocket should automatically update the devices
        }}
      />

      <BillingBreakdownDialog
        open={isBreakdownDialogOpen}
        onOpenChange={setIsBreakdownDialogOpen}
        row={selectedRow}
      />
      </Card>
    </div>
  );
}
