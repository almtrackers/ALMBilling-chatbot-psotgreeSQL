
'use client';

import { useState, useMemo, useRef } from 'react';
import { useDealers } from '@/hooks/use-dealers';
import { useStockAllocations } from '@/hooks/use-stock-allocations';
import { useSales } from '@/hooks/use-sales';
import { useExpenses } from '@/hooks/use-expenses';
import { useUserPin } from '@/hooks/use-user-pin';
import axios from 'axios';
import type { Dealer, StockAllocation, Sale, Expense } from '@/lib/types';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { ServerCrash, MoreHorizontal, User, Trash2, Edit, Link2, Printer } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import AddDealerForm from './add-dealer-form';
import PinDialog from '@/components/auth/pin-dialog';
import Logo from '@/components/logo';

const RECORDS_PER_PAGE = 15;

const fetcher = (url: string) => fetch(url).then(res => res.json());

const PrintableDealerReport = ({ dealer, sales, summary }: { dealer: Dealer | null, sales: Sale[], summary: {totalSales: number, totalCommission: number} }) => {
  if (!dealer) return null;

  return (
    <div className="p-4">
      <div className="flex justify-center mb-4">
        <Logo />
      </div>
      <h2 className="text-xl font-bold text-center">Sales Report for {dealer.name}</h2>
      <p className="text-center text-sm text-muted-foreground">Generated on {format(new Date(), 'PPP')}</p>
      <Table className="mt-6">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Sale Amount</TableHead>
            <TableHead>Commission Paid</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.length > 0 ? (
            sales.map(sale => (
              <TableRow key={sale.id}>
                <TableCell>{sale.date ? format(typeof sale.date === 'string' ? parseISO(sale.date) : new Date(sale.date), 'PP') : 'N/A'}</TableCell>
                <TableCell>{sale.customerName}</TableCell>
                <TableCell>{sale.vehicleNumber}</TableCell>
                <TableCell>PKR {Number(sale.amount).toLocaleString()}</TableCell>
                <TableCell>PKR {(Number(sale.commission) || 0).toLocaleString()}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">No sales found for this dealer.</TableCell>
            </TableRow>
          )}
        </TableBody>
        <TableFooter>
            <TableRow className="font-semibold">
            <TableCell colSpan={3} className="text-right">Totals</TableCell>
            <TableCell>Sales: {summary.totalSales}</TableCell>
            <TableCell>PKR {summary.totalCommission.toLocaleString()}</TableCell>
            </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};


export default function DealerList({ searchTerm }: DealerListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  
  const { dealers, isLoading: isLoadingDealers, error: errorDealers, mutate: mutateDealers } = useDealers();
  const { stockAllocations: allocations, isLoading: isLoadingAllocations } = useStockAllocations();
  const { sales, isLoading: isLoadingSales } = useSales();
  const { expenses, isLoading: isLoadingExpenses } = useExpenses();
  const { pinStatus: userPin } = useUserPin(user?.email);

  const commissionExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter(e => e.type === 'commission');
  }, [expenses]);

  const dealerCommissions = useMemo(() => {
    const commissions = new Map<string, number>();
    
    // Aggregate commissions from sales
    if (sales) {
      sales.forEach(sale => {
        if (sale.dealerId && sale.commission) {
          commissions.set(sale.dealerId, (commissions.get(sale.dealerId) || 0) + Number(sale.commission));
        }
      });
    }

    // Aggregate commissions from expenses
    if (commissionExpenses) {
      commissionExpenses.forEach(expense => {
        if (expense.dealerId) {
          commissions.set(expense.dealerId, (commissions.get(expense.dealerId) || 0) + Number(expense.amount));
        }
      });
    }
    
    return commissions;
  }, [sales, commissionExpenses]);


  const filteredDealers = useMemo(() => {
    if (!dealers) return [];
    if (!searchTerm) return dealers;
    return dealers.filter(dealer => dealer.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [dealers, searchTerm]);
  
  const paginatedDealers = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredDealers.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredDealers, currentPage]);
  
  const totalPages = Math.ceil(filteredDealers.length / RECORDS_PER_PAGE);

  const dealerSales = useMemo(() => {
    if (!selectedDealer || !sales) return [];
    return sales.filter(sale => sale.dealerId === selectedDealer.id);
  }, [selectedDealer, sales]);

  const dealerSalesSummary = useMemo(() => {
    return dealerSales.reduce((acc, sale) => {
        acc.totalSales += 1;
        acc.totalCommission += sale.commission || 0;
        return acc;
    }, { totalSales: 0, totalCommission: 0 });
  }, [dealerSales]);


  const openDeleteDialog = (dealer: Dealer) => {
    const dealerHasAllocations = allocations?.some(alloc => alloc.dealerId === dealer.id);

    if (dealerHasAllocations) {
        toast({
            variant: 'destructive',
            title: 'Cannot Delete Dealer',
            description: `This dealer has active stock allocations. Please reverse the allocations before deleting the dealer.`,
        });
        return;
    }
    
    setSelectedDealer(dealer);
    setIsAlertOpen(true);
  };
  
  const openEditDialog = (dealer: Dealer) => {
    setSelectedDealer(dealer);
    setIsEditDialogOpen(true);
  };
  
  const openDetailsDialog = (dealer: Dealer) => {
    setSelectedDealer(dealer);
    setIsDetailsDialogOpen(true);
  };

  const confirmDeletion = () => {
    setIsAlertOpen(false);
    if (userPin?.hasPin) {
      setIsPinDialogOpen(true);
    } else {
      handleDelete();
    }
  };

  const handleDelete = async () => {
    if (selectedDealer && user) {
      try {
        await axios.delete(`/api/dealers?id=${selectedDealer.id}`);
        await addLog(`Deleted dealer: "${selectedDealer.name}"`, user.name, 'delete');
        toast({
          title: 'Dealer Deleted',
          description: `The dealer "${selectedDealer.name}" has been removed.`,
        });
        mutateDealers();
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: err.response?.data?.message || 'Failed to delete dealer',
        });
      }
      setSelectedDealer(null);
    }
    setIsAlertOpen(false);
    setIsPinDialogOpen(false);
  };
  
  const handlePrint = (dealer: Dealer) => {
    setSelectedDealer(dealer);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  }

  const isLoading = isLoadingDealers || isLoadingAllocations || isLoadingSales || isLoadingExpenses;
  const error = errorDealers;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dealers</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load dealers</AlertTitle>
            <AlertDescription>
              There was a problem fetching your dealer data.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, [data-radix-dialog-overlay] {
            display: none !important;
          }
          .printable-area {
            display: block !important;
          }
        }
      `}</style>
      
      {isPrinting ? (
        <div className="printable-area">
          <PrintableDealerReport dealer={selectedDealer} sales={dealerSales} summary={dealerSalesSummary} />
        </div>
      ) : (
        <div className="no-print">
            <Card>
                <CardHeader>
                <CardTitle>Dealer List</CardTitle>
                <CardDescription>A list of all your registered dealers.</CardDescription>
                </CardHeader>
                <CardContent>
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Dealer Name</TableHead>
                        <TableHead>Phone Number</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Total Commission Paid</TableHead>
                        <TableHead>Date Added</TableHead>
                        <TableHead>
                        <span className="sr-only">Actions</span>
                        </TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {paginatedDealers && paginatedDealers.length > 0 ? (
                        paginatedDealers.map((dealer) => (
                        <TableRow key={dealer.id}>
                            <TableCell className="font-medium">{dealer.name}</TableCell>
                            <TableCell>{dealer.phone}</TableCell>
                            <TableCell>{dealer.address}</TableCell>
                            <TableCell>PKR {(dealerCommissions.get(dealer.id) || 0).toLocaleString()}</TableCell>
                            <TableCell>
                            {dealer.createdAt
                                ? format(typeof dealer.createdAt === 'string' ? parseISO(dealer.createdAt) : new Date(dealer.createdAt), 'PPP')
                                : 'N/A'}
                            </TableCell>
                            <TableCell>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Toggle menu</span>
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => openDetailsDialog(dealer)}>
                                    <Link2 className="mr-2 h-4 w-4" />
                                    Connection Details
                                </DropdownMenuItem>
                                 <DropdownMenuItem onClick={() => handlePrint(dealer)}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    Print Report
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(dealer)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    onClick={() => openDeleteDialog(dealer)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            </TableCell>
                        </TableRow>
                        ))
                    ) : (
                        <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <User className="h-8 w-8" />
                            <p>No dealers found.</p>
                            {searchTerm ? (
                                <p className="text-xs">No dealers match your search for "{searchTerm}".</p>
                            ): (
                                <p className="text-xs">Use the "Add Dealer" button to create one.</p>
                            )}
                            </div>
                        </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
                <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                        disabled={currentPage === 1}
                    >
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages > 0 ? totalPages : 1}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
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
                    This action cannot be undone. This will permanently delete the dealer from your records.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                    className="bg-destructive hover:bg-destructive/90"
                    onClick={confirmDeletion}
                    >
                    Yes, delete it
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <PinDialog
                open={isPinDialogOpen}
                onOpenChange={setIsPinDialogOpen}
                onSuccess={handleDelete}
                actionDescription={`delete dealer: ${selectedDealer?.name}`}
            />

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit Dealer</DialogTitle>
                    <DialogDescription>
                        Update the details for this dealer.
                    </DialogDescription>
                </DialogHeader>
                <AddDealerForm setDialogOpen={setIsEditDialogOpen} dealerToEdit={selectedDealer!} />
                </DialogContent>
            </Dialog>
            
            <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
                <DialogContent className="sm:max-w-4xl no-print">
                <DialogHeader>
                    <div className="flex justify-between items-center">
                    <div>
                        <DialogTitle>Connection Details: {selectedDealer?.name}</DialogTitle>
                        <DialogDescription>
                            A complete sales history for this dealer.
                        </DialogDescription>
                    </div>
                    </div>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">

                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Sale Amount</TableHead>
                        <TableHead>Commission Paid</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {dealerSales.length > 0 ? (
                        dealerSales.map(sale => (
                            <TableRow key={sale.id}>
                            <TableCell>{sale.date ? format(typeof sale.date === 'string' ? parseISO(sale.date) : new Date(sale.date), 'PP') : 'N/A'}</TableCell>
                            <TableCell>{sale.customerName}</TableCell>
                            <TableCell>{sale.vehicleNumber}</TableCell>
                            <TableCell>PKR {sale.amount.toLocaleString()}</TableCell>
                            <TableCell>PKR {(sale.commission || 0).toLocaleString()}</TableCell>
                            </TableRow>
                        ))
                        ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                            No sales found for this dealer.
                            </TableCell>
                        </TableRow>
                        )}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="font-semibold">
                        <TableCell colSpan={3} className="text-right">Totals</TableCell>
                        <TableCell>Sales: {dealerSalesSummary.totalSales}</TableCell>
                        <TableCell>PKR {dealerSalesSummary.totalCommission.toLocaleString()}</TableCell>
                        </TableRow>
                    </TableFooter>
                    </Table>
                </div>
                </DialogContent>
            </Dialog>
        </div>
      )}
    </>
  );
}
