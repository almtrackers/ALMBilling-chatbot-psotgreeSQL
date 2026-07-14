
'use client';

import { useState, useMemo } from 'react';
import axios from 'axios';
import type { Dealer, InventoryItem, StockAllocation } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ServerCrash, MoreHorizontal, Truck, Trash2, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { useStockAllocations } from '@/hooks/use-stock-allocations';
import { useDealers } from '@/hooks/use-dealers';
import { useInventory } from '@/hooks/use-inventory';
import { useUserPin } from '@/hooks/use-user-pin';
import { Badge } from '@/components/ui/badge';
import PinDialog from '@/components/auth/pin-dialog';

const RECORDS_PER_PAGE = 15;

export default function AllocationList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [selectedAllocation, setSelectedAllocation] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dealerFilter, setDealerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const { stockAllocations: allocations, isLoading: loadingAllocations, isError: errorAllocations, mutate: mutateAllocations } = useStockAllocations();
  const { dealers, isLoading: loadingDealers } = useDealers();
  const { inventoryItems, isLoading: loadingInventory } = useInventory();
  const { pinStatus: userPin } = useUserPin(user?.traccarId);

  const itemTypes = useMemo(() => {
    if (!inventoryItems) return [];
    return [...new Set(inventoryItems.map(item => item.type))];
  }, [inventoryItems]);

  const allocationsWithDetails = useMemo(() => {
    if (!Array.isArray(allocations) || !dealers || !inventoryItems) return [];
    
    const dealerMap = new Map(dealers.map(o => [o.id, o.name]));
    const itemMap = new Map(inventoryItems.map(i => [i.id, {name: i.name, type: i.type}]));

    let filtered = allocations.map(alloc => ({
      ...alloc,
      dealerName: dealerMap.get(alloc.dealerId) || 'Unknown Dealer',
      itemName: itemMap.get(alloc.inventoryItemId)?.name || 'Unknown Item',
      itemType: itemMap.get(alloc.inventoryItemId)?.type,
    }));

    if (searchTerm) {
        filtered = filtered.filter(alloc => alloc.itemName.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    if (dealerFilter !== 'all') {
        filtered = filtered.filter(alloc => alloc.dealerId === dealerFilter);
    }
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(alloc => alloc.itemType === categoryFilter);
    }
    
    setCurrentPage(1);
    return filtered;

  }, [allocations, dealers, inventoryItems, searchTerm, dealerFilter, categoryFilter]);
  
  const paginatedAllocations = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return allocationsWithDetails.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [allocationsWithDetails, currentPage]);

  const totalPages = Math.ceil(allocationsWithDetails.length / RECORDS_PER_PAGE);

  const openDeleteDialog = (allocation: any) => {
    setSelectedAllocation(allocation);
    setIsAlertOpen(true);
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
    if (selectedAllocation && user) {
        try {
            await axios.delete(`/api/stock-allocations?id=${selectedAllocation.id}`);
            await addLog(`Reversed stock allocation: ${selectedAllocation.quantity} x ${selectedAllocation.itemName} from ${selectedAllocation.dealerName}`, user.name, 'delete');
            toast({
                title: 'Allocation Reversed',
                description: 'The stock allocation has been deleted.',
            });
            mutateAllocations();
            setSelectedAllocation(null);
        } catch (error: any) {
            console.error("Reversal failed:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.response?.data?.message || 'Failed to reverse allocation',
            });
        }
    }
    setIsPinDialogOpen(false);
    setIsAlertOpen(false);
  };
  
  const isLoading = loadingAllocations || loadingDealers || loadingInventory;
  const error = errorAllocations;

  const formatItemType = (type: string | undefined) => {
    if (!type) return 'N/A';
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
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
          <CardTitle>Stock Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load allocations</AlertTitle>
            <AlertDescription>
              There was a problem fetching your stock allocation data.
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
          <CardTitle>Allocation History</CardTitle>
          <CardDescription>A log of all stock movements to different dealers.</CardDescription>
           <div className="flex flex-col sm:flex-row items-center gap-2 pt-4">
            <div className="relative w-full sm:w-auto sm:flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by item name..."
                className="pl-8 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex w-full sm:w-auto gap-2">
                <Select value={dealerFilter} onValueChange={setDealerFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by dealer" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Dealers</SelectItem>
                    {dealers?.map(dealer => (
                    <SelectItem key={dealer.id} value={dealer.id}>
                        {dealer.name}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {itemTypes.map(type => (
                    <SelectItem key={type} value={type}>
                        {formatItemType(type)}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Destination Dealer</TableHead>
                <TableHead>Allocated By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedAllocations.length > 0 ? (
                paginatedAllocations.map((alloc) => (
                  <TableRow key={alloc.id}>
                    <TableCell className="font-medium">{alloc.itemName}</TableCell>
                    <TableCell>
                      {alloc.itemType === 'tracker' && (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {alloc.allocatedImeis?.map(imei => <Badge variant="secondary" key={imei}>{imei}</Badge>)}
                        </div>
                      )}
                      {alloc.itemType === 'sim' && (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {alloc.allocatedSims?.map(sim => <Badge variant="secondary" key={sim.simNumber}>{sim.simNumber}</Badge>)}
                        </div>
                      )}
                      {(alloc.itemType !== 'tracker' && alloc.itemType !== 'sim') && (
                        <span>Qty: {alloc.quantity}</span>
                      )}
                    </TableCell>
                    <TableCell>{alloc.dealerName}</TableCell>
                    <TableCell>{alloc.allocatedBy}</TableCell>
                    <TableCell>
                      {alloc.allocatedAt
                        ? format(typeof alloc.allocatedAt === 'string' ? parseISO(alloc.allocatedAt) : new Date(alloc.allocatedAt), 'PPP p')
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
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            onClick={() => openDeleteDialog(alloc)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Reverse Allocation
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
                      <Truck className="h-8 w-8" />
                      <p>No stock allocations found.</p>
                      <p className="text-xs">Try adjusting your filters or use the "Allocate Stock" button.</p>
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
              This action will reverse the stock allocation, returning the items to your central inventory. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDeletion}
            >
              Yes, reverse it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PinDialog
        open={isPinDialogOpen}
        onOpenChange={setIsPinDialogOpen}
        onSuccess={handleDelete}
        actionDescription={`reverse allocation for ${selectedAllocation?.itemName}`}
      />
    </>
  );
}
