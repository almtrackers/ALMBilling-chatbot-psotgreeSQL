
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Sale, Dealer, AppSettings, Device } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { format, isWithinInterval, addMonths, addYears, differenceInDays, parseISO } from 'date-fns';
import { ServerCrash, FileText, MoreHorizontal, Printer, Edit, Link2Off, Replace, Info } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { apiClient, localApiClient } from '@/lib/api';
import { useDevices } from '@/hooks/use-devices';
import { useAuth } from '@/contexts/auth-context';
import { useSales } from '@/hooks/use-sales';
import { useDealers } from '@/hooks/use-dealers';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useUserPin } from '@/hooks/use-user-pin';
import { VehicleCardActions } from '@/components/dashboard/users/client-document-actions';
import { addLog } from '@/lib/log-service';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import EditSaleForm from './edit-sale-form';
import PinDialog from '@/components/auth/pin-dialog';
import ManageSubscriptionDialog from './manage-subscription-dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ReplaceHardwareDialog from './replace-hardware-dialog';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

const ensureDate = (date: any): Date => {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  return new Date(date);
};

const RECORDS_PER_PAGE = 15;

type SalesListProps = {
  searchTerm: string;
  dealerFilter: string;
  dateRange?: DateRange;
};

const MaskedValue = ({ value, secondValue, isPassword }: { value: string; secondValue?: string; isPassword?: boolean }) => {
  const [isRevealed, setIsRevealed] = useState(false);

  if (!value) {
    return <span>N/A</span>;
  }
  
  const displayValue = secondValue ? `${value} / ${secondValue}` : value;
  const maskedValue = '••••••';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRevealed) return;
    setIsRevealed(true);
    navigator.clipboard.writeText(value);
  };

  return (
    <div 
      onClick={handleClick}
      onMouseLeave={() => setIsRevealed(false)}
      className="cursor-pointer"
      title="Click to reveal and copy"
    >
      {isRevealed ? displayValue : maskedValue}
    </div>
  );
};


export default function SalesList({ searchTerm, dealerFilter, dateRange }: SalesListProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isManageSubDialogOpen, setIsManageSubDialogOpen] = useState(false);
  const [isReplaceDialogOpen, setIsReplaceDialogOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [deleteFromTraccar, setDeleteFromTraccar] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [autoExpiryTarget, setAutoExpiryTarget] = useState<{
    sale: Sale;
    device: Device;
    expectedExpiryDate: Date;
    durationType: 'monthly' | 'yearly';
  } | null>(null);
  const [isAutoExpiryLoading, setIsAutoExpiryLoading] = useState(false);

  const { sales, isLoading: isLoadingSales, isError: salesError, mutate: mutateSales } = useSales();
  const { dealers, isLoading: isLoadingDealers } = useDealers();
  const { appSettings } = useAppSettings();
  const { pinStatus: userPin } = useUserPin(user?.traccarId);
  const { devices, mutate: mutateDevices } = useDevices();

  const dealerMap = useMemo(() => {
    if (!dealers) return new Map();
    return new Map(dealers.map(d => [d.id, d.name]));
  }, [dealers]);

  const filteredSales = useMemo(() => {
    if (!sales) return [];

    const filtered = sales.filter(sale => {
      // Dealer filter
      if (dealerFilter !== 'all') {
        if (dealerFilter === 'direct' && sale.dealerId) return false;
        if (dealerFilter !== 'direct' && sale.dealerId !== dealerFilter) return false;
      }
      
      // Date range filter
      if (dateRange && dateRange.from) {
        const interval = { start: dateRange.from, end: dateRange.to || dateRange.from };
        const saleDate = ensureDate(sale.date);
        if (!isWithinInterval(saleDate, interval)) {
          return false;
        }
      }

      // Search term filter
      if (searchTerm) {
        const lowercasedTerm = searchTerm.toLowerCase();
        const idMatch = sale.id?.toLowerCase().includes(lowercasedTerm);
        const customerMatch = sale.customerName?.toLowerCase().includes(lowercasedTerm);
        const vehicleMatch = sale.vehicleNumber?.toLowerCase().includes(lowercasedTerm);
        const imeiMatch = sale.imei?.toLowerCase().includes(lowercasedTerm);
        if (!idMatch && !customerMatch && !vehicleMatch && !imeiMatch) return false;
      }

      return true;
    });

    return filtered;

  }, [sales, searchTerm, dealerFilter, dateRange]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dealerFilter, dateRange]);

  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredSales.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredSales, currentPage]);

  const totalPages = Math.ceil(filteredSales.length / RECORDS_PER_PAGE);

  const totalSalesAmount = useMemo(() => {
    return filteredSales.reduce((total, sale) => total + Number(sale.amount), 0);
  }, [filteredSales]);

  const openEditDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setIsEditDialogOpen(true);
  };
  
  const openManageSubDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setIsManageSubDialogOpen(true);
  }

  const openReplaceDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setIsReplaceDialogOpen(true);
  }
  
  const openDeleteDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setDeleteFromTraccar(false); // Default to unchecked
    setIsAlertOpen(true);
  };

  const handlePrintReceipt = (sale: Sale) => {
    router.push(`/dashboard/sales/${sale.id}/receipt`);
  };
  
  const confirmDeletion = () => {
    setIsAlertOpen(false);
    if (userPin?.hasPin) {
      setIsPinDialogOpen(true);
    } else {
      handleDelete(); // No PIN set, proceed directly
    }
  };

  const handleDelete = async () => {
    if (!selectedSale || !user) return;
    const saleToDelete = selectedSale; // Capture the sale object
    
    try {
        if (deleteFromTraccar) {
            const deviceToDelete = devices?.find(d => d.uniqueId === saleToDelete.imei);
            if (deviceToDelete) {
                try {
                    await apiClient.delete(`/devices/${deviceToDelete.id}`);
                    toast({
                        title: 'Device Deleted from Server',
                        description: `Device ${deviceToDelete.name} has been removed.`,
                    });
                    mutateDevices(); // Refresh device list
                    await addLog(`Deleted server device ${deviceToDelete.name} during sale deletion`, user.name, 'delete');
                } catch (traccarError: any) {
                    if (traccarError?.response?.status === 404) {
                         toast({
                            title: 'Device Not Found on Server',
                            description: 'The device was already removed from the server.',
                        });
                    } else {
                        throw new Error(`Server error: ${traccarError.message}`);
                    }
                }
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Device Not Found',
                    description: 'Could not find the device on the server to delete.',
                });
            }
        }
        
        // Always delete the MySQL sale record via API
        await localApiClient.delete(`/sales/${saleToDelete.id}`);
        mutateSales(); // Refresh the list from MySQL
        await addLog(`Deleted sale record #${saleToDelete.id} for ${saleToDelete.vehicleNumber}`, user.name, 'delete');
        toast({
            title: 'Sale Deleted',
            description: 'The sale has been removed from your records.',
        });

    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Deletion Failed',
            description: error.message || 'An unexpected error occurred.',
        });
    } finally {
        setSelectedSale(null);
        setIsPinDialogOpen(false);
    }
  };

  const openAutoExpiry = (target: {
    sale: Sale;
    device: Device;
    expectedExpiryDate: Date;
    durationType: 'monthly' | 'yearly';
  }) => {
    setAutoExpiryTarget(target);
  };

  const closeAutoExpiry = () => {
    setAutoExpiryTarget(null);
  };

  const handleConfirmAutoExpiry = async () => {
    if (!autoExpiryTarget) return;
    const { device, expectedExpiryDate, durationType } = autoExpiryTarget;
    setIsAutoExpiryLoading(true);
    try {
      const { position, ...payload } = device as any;
      await apiClient.put(`/devices/${device.id}`, {
        ...payload,
        expirationTime: expectedExpiryDate.toISOString(),
        attributes: {
          ...device.attributes,
          expiryDate: expectedExpiryDate.toISOString(),
        },
      });
      toast({
        title: 'Expiry updated',
        description: `Device expiry set to ${format(expectedExpiryDate, 'PPP')} (${durationType}).`,
      });
      mutateDevices();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to update expiry',
        description: error.message || 'Could not update the device expiration on the server.',
      });
    } finally {
      setIsAutoExpiryLoading(false);
      closeAutoExpiry();
    }
  };

  const isLoading = isLoadingSales || isLoadingDealers;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales History</CardTitle>
          <CardDescription>Fetching your sales records...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (salesError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales History</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load sales</AlertTitle>
            <AlertDescription>
              There was a problem fetching your sales data. Please check your
              connection and try again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sales History</CardTitle>
          <CardDescription>
            A list of all your income-generating sales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle No.</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Dealer</TableHead>
                <TableHead>IMEI</TableHead>
                <TableHead>SIM / IMSI</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Installation Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vehicle Card</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedSales && paginatedSales.length > 0 ? (
                paginatedSales.map((sale) => {
                  const device = devices?.find(d => d.uniqueId === sale.imei);
                  const devicePassword = device?.attributes?.devicePassword;
                  const threshold = appSettings?.monthlyYearlyThreshold || 2000;
                  const renewalFee = Number(sale.renewalFee ?? 0);
                  const durationType = renewalFee > threshold ? 'yearly' : 'monthly';
                  const saleDate = ensureDate(sale.date);
                  
                  let expectedExpiryDate: Date;
                  if (durationType === 'yearly') {
                    const nextYear = addYears(saleDate, 1);
                    expectedExpiryDate = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59);
                  } else {
                    const nextMonth = addMonths(saleDate, 1);
                    expectedExpiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
                  }
                  const billingExpiry = device?.attributes?.expiryDate || device?.expirationTime;
                  const expiryDate = billingExpiry ? parseISO(billingExpiry) : null;
                  const extraDays = expiryDate ? differenceInDays(expiryDate, expectedExpiryDate) : 0;
                  const warnings: {
                    text: string;
                    reason: string;
                    variant?: 'destructive' | 'secondary';
                    className?: string;
                  }[] = [];
                  if (!expiryDate) {
                    warnings.push({
                      text: 'Missing expiry',
                      reason: 'The device lacks an expiryDate attribute, so its billing status cannot be verified.',
                      variant: 'destructive',
                    });
                  } else if (extraDays > 0) {
                    warnings.push({
                      text: `Expiry ${extraDays}d ahead`,
                      reason: `Device expiry (${format(expiryDate, 'PPP')}) is ${extraDays} days after the paid period end (${format(expectedExpiryDate, 'PPP')}).`,
                      className: 'bg-yellow-500 hover:bg-yellow-600 text-foreground',
                    });
                  }
                  return (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">{sale.customerName}</TableCell>
                    <TableCell>{sale.vehicleNumber}</TableCell>
                    <TableCell>PKR {Number(sale.amount).toLocaleString()}</TableCell>
                    <TableCell>{sale.dealerId ? dealerMap.get(sale.dealerId) || 'Unknown' : 'Direct Sale'}</TableCell>
                    <TableCell>
                      <MaskedValue value={sale.imei || ''} />
                    </TableCell>
                    <TableCell>
                      <MaskedValue value={sale.simNumber || ''} secondValue={sale.imsi} />
                    </TableCell>
                    <TableCell>
                      {devicePassword ? <MaskedValue value={devicePassword} isPassword /> : 'N/A'}
                    </TableCell>
                    <TableCell>{format(ensureDate(sale.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                       <Badge variant={sale.status === 'unsubscribed' ? 'destructive' : 'default'} className={sale.status !== 'unsubscribed' ? 'bg-green-500' : ''}>
                        {sale.status === 'unsubscribed' ? 'Unsubscribed' : 'Active'}
                       </Badge>
                    </TableCell>
                    <TableCell>
                      <VehicleCardActions
                        type="sale"
                        id={sale.id}
                        hasDocument={!!sale.vehicleCardPath}
                        onReplaced={() => mutateSales()}
                      />
                    </TableCell>
                    <TableCell>
                      {warnings.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {warnings.map((warning) => (
                            <TooltipProvider key={warning.text}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!device) return;
                                      openAutoExpiry({
                                        sale,
                                        device,
                                        expectedExpiryDate,
                                        durationType,
                                      });
                                    }}
                                    disabled={!device}
                                    className="focus-visible:outline-none"
                                  >
                                    <Badge
                                      variant={warning.variant || 'destructive'}
                                      className={cn(warning.className, 'flex items-center gap-1 text-[11px]')}
                                    >
                                      {warning.text}
                                      <Info className="h-3 w-3" />
                                    </Badge>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {warning.reason}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-haspopup="true"
                            size="icon"
                            variant="ghost"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                           <DropdownMenuItem onClick={() => openEditDialog(sale)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrintReceipt(sale)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print Receipt
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openReplaceDialog(sale)} disabled={sale.status === 'unsubscribed'}>
                             <Replace className="mr-2 h-4 w-4" />
                            Replace Hardware
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openManageSubDialog(sale)} disabled={sale.status === 'unsubscribed'}>
                             <Link2Off className="mr-2 h-4 w-4" />
                            Manage Subscription
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            onClick={() => openDeleteDialog(sale)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p>No sales found.</p>
                       {searchTerm || dealerFilter !== 'all' ? (
                        <p className="text-xs">No sales match your current filters.</p>
                      ) : (
                        <p className="text-xs">Use the "Add Sale" button to start logging income.</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={2} className="text-right font-bold">Total</TableCell>
                    <TableCell className="font-bold">
                        PKR {totalSalesAmount.toLocaleString()}
                    </TableCell>
                    <TableCell colSpan={9}></TableCell>
                </TableRow>
            </TableFooter>
          </Table>
           <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages > 0 ? totalPages : 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Next
              </Button>
            </div>
        </CardContent>
      </Card>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the sale record. You can also choose to delete the device from the server.
            </AlertDialogDescription>
            <div className="flex items-center space-x-2 pt-4">
                <Checkbox 
                    id="delete-traccar-checkbox" 
                    checked={deleteFromTraccar}
                    onCheckedChange={(checked) => setDeleteFromTraccar(Boolean(checked))}
                />
                <Label htmlFor="delete-traccar-checkbox" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Also delete device from server
                </Label>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDeletion}
            >
              Confirm Deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(autoExpiryTarget)}
        onOpenChange={(open) => {
          if (!open) {
            closeAutoExpiry();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auto-set device expiry</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the device’s expiration date to match the {autoExpiryTarget?.durationType} period
              starting from the sale date ({autoExpiryTarget
                ? format(ensureDate(autoExpiryTarget.sale.date), 'PPP')
                : 'N/A'}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-white hover:bg-primary/90"
              onClick={handleConfirmAutoExpiry}
              disabled={isAutoExpiryLoading}
            >
              {isAutoExpiryLoading ? 'Updating...' : 'Apply expiry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <PinDialog
        open={isPinDialogOpen}
        onOpenChange={setIsPinDialogOpen}
        onSuccess={handleDelete}
        actionDescription={`delete sale for ${selectedSale?.vehicleNumber}`}
      />

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Sale and Device</DialogTitle>
            <DialogDescription>
              Update sale details and device information on the server.
            </DialogDescription>
          </DialogHeader>
          {selectedSale && <EditSaleForm sale={selectedSale} setDialogOpen={setIsEditDialogOpen} />}
        </DialogContent>
      </Dialog>
      
      <ManageSubscriptionDialog
        open={isManageSubDialogOpen}
        onOpenChange={setIsManageSubDialogOpen}
        sale={selectedSale}
      />
      <ReplaceHardwareDialog
        open={isReplaceDialogOpen}
        onOpenChange={setIsReplaceDialogOpen}
        sale={selectedSale}
      />
    </>
  );
}
