
'use client';

import { useState, useMemo } from 'react';
import axios from 'axios';
import type { InventoryItem, Sale, SimCard, StockAllocation } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ServerCrash, MoreHorizontal, Warehouse, ListPlus, Trash2, Edit, Save, Search, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AddInventoryItemForm from './add-inventory-item-form';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { addLog } from '@/lib/log-service';
import { useAuth } from '@/contexts/auth-context';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import PinDialog from '@/components/auth/pin-dialog';
import { useInventory } from '@/hooks/use-inventory';
import { useSales } from '@/hooks/use-sales';
import { useStockAllocations } from '@/hooks/use-stock-allocations';
import { useUserPin } from '@/hooks/use-user-pin';
import { parseISO } from 'date-fns';

const RECORDS_PER_PAGE = 15;

const NumberManager = ({ item, allItems, setDialogOpen, mutateItems }: { item: InventoryItem; allItems: InventoryItem[]; setDialogOpen: (open: boolean) => void; mutateItems: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isTracker = item.type === 'tracker';
  
  const [newImeis, setNewImeis] = useState('');
  const [newSimNumbers, setNewSimNumbers] = useState('');
  const [newImsis, setNewImsis] = useState('');

  const [selectedHarnessId, setSelectedHarnessId] = useState<string>('');
  const [selectedRelayId, setSelectedRelayId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [selectedSosId, setSelectedSosId] = useState<string>('');

  const harnessOptions = useMemo(
    () => allItems.filter((i) => i.type === 'wire_plug_harness'),
    [allItems]
  );
  const relayOptions = useMemo(
    () => allItems.filter((i) => i.type === 'relay'),
    [allItems]
  );
  const micOptions = useMemo(
    () => allItems.filter((i) => i.type === 'mic'),
    [allItems]
  );
  const sosOptions = useMemo(
    () => allItems.filter((i) => i.type === 'sos_button'),
    [allItems]
  );

  const handleSave = async () => {
    if (!user) return;

    try {
        let updateData: any = { id: item.id };
        let newQuantity = 0;
        let logMessage = '';

        if (isTracker) {
            if (!selectedHarnessId) {
              toast({
                variant: 'destructive',
                title: 'Wire Harness Required',
                description: 'Please select a wire harness to add with the new trackers.',
              });
              return;
            }

            const newImeiList = [...new Set(newImeis.split('\n').map(i => i.trim()).filter(Boolean))];
            if (newImeiList.length === 0) {
                toast({ variant: 'destructive', title: 'No New IMEIs', description: 'Please enter at least one new IMEI.' });
                return;
            }
            const allExistingImeis = new Set(allItems.filter(i => i.type === 'tracker').flatMap(i => i.imeis || []));
            const duplicates = newImeiList.filter(i => allExistingImeis.has(i));
            if (duplicates.length > 0) {
                toast({ variant: 'destructive', title: 'Duplicate IMEIs', description: `The following IMEIs already exist: ${duplicates.join(', ')}` });
                return;
            }
            const updatedImeiList = [...(item.imeis || []), ...newImeiList];
            newQuantity = updatedImeiList.length;
            updateData.imeis = updatedImeiList;
            updateData.quantity = newQuantity;
            logMessage = `Added ${newImeiList.length} new IMEI(s) to ${item.name} with accessories`;

            const countToAdd = newImeiList.length;
            const updatePromises = [];

            // Update main item
            updatePromises.push(axios.put('/api/inventory', updateData));

            // Required harness: increment by number of new trackers
            const harnessItem = allItems.find((i) => i.id === selectedHarnessId);
            if (harnessItem) {
              updatePromises.push(axios.put('/api/inventory', {
                id: harnessItem.id,
                quantity: (harnessItem.quantity || 0) + countToAdd,
              }));
            }

            // Optional accessories: relay, mic, SOS button
            const accessoryIds = [
              selectedRelayId,
              selectedMicId,
              selectedSosId,
            ].filter(Boolean) as string[];

            accessoryIds.forEach((id) => {
              const accessoryItem = allItems.find((i) => i.id === id);
              if (!accessoryItem) return;
              updatePromises.push(axios.put('/api/inventory', {
                id: accessoryItem.id,
                quantity: (accessoryItem.quantity || 0) + countToAdd,
              }));
            });

            await Promise.all(updatePromises);
            await addLog(logMessage, user.name, 'update');
            mutateItems();
            toast({
              title: 'Stock Updated',
              description: `Successfully added new trackers and accessories to ${item.name}.`,
            });
            setDialogOpen(false);
            return;
        } else { // SIM
            const newSimNumberList = newSimNumbers.split('\n').map(s => s.trim()).filter(Boolean);
            const newImsiList = newImsis.split('\n').map(i => i.trim()).filter(Boolean);

            if (newSimNumberList.length === 0) {
                 toast({ variant: 'destructive', title: 'No New SIMs', description: 'Please enter at least one new SIM Number.' });
                return;
            }
            if (newSimNumberList.length !== newImsiList.length) {
                toast({ variant: 'destructive', title: 'Mismatch Error', description: 'The number of SIMs and IMSIs must match.' });
                return;
            }
            
            const newSimData: SimCard[] = newSimNumberList.map((simNumber, i) => ({ simNumber, imsi: newImsiList[i] }));
            const allExistingSims = new Set(allItems.filter(i => i.type === 'sim').flatMap(i => i.sims?.map(s => s.simNumber) || []));
            const allExistingImsis = new Set(allItems.filter(i => i.type === 'sim').flatMap(i => i.sims?.map(s => s.imsi) || []));

            const duplicateSims = newSimData.filter(s => allExistingSims.has(s.simNumber));
            if (duplicateSims.length > 0) {
                toast({ variant: 'destructive', title: 'Duplicate SIMs', description: `The following SIMs already exist: ${duplicateSims.map(s => s.simNumber).join(', ')}` });
                return;
            }
            const duplicateImsis = newSimData.filter(s => allExistingImsis.has(s.imsi));
            if (duplicateImsis.length > 0) {
                toast({ variant: 'destructive', title: 'Duplicate IMSIs', description: `The following IMSIs already exist: ${duplicateImsis.map(s => s.imsi).join(', ')}` });
                return;
            }
            
            const updatedSimsList = [...(item.sims || []), ...newSimData];
            newQuantity = updatedSimsList.length;
            updateData.sims = updatedSimsList;
            updateData.quantity = newQuantity;
            logMessage = `Added ${newSimData.length} new SIM(s) to ${item.name}`;
        }

      await axios.put('/api/inventory', updateData);
      await addLog(logMessage, user.name, 'update');
      mutateItems();
      toast({
        title: 'Stock Updated',
        description: `Successfully added new items to ${item.name}.`,
      });
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Failed to update stock`,
        description: error.response?.data?.message || error.message,
      });
    }
  };
  
  return (
    <div className="space-y-4">
      {isTracker ? (
        <div>
            <Label>Current IMEIs ({(item.imeis || []).length})</Label>
            <Textarea value={(item.imeis || []).join('\n')} readOnly className="h-32 bg-muted" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label>Current SIMs ({(item.sims || []).length})</Label>
                <Textarea value={item.sims?.map(s => s.simNumber).join('\n') || ''} readOnly className="h-32 bg-muted" />
            </div>
            <div>
                <Label>Current IMSIs ({(item.sims || []).length})</Label>
                <Textarea value={item.sims?.map(s => s.imsi).join('\n') || ''} readOnly className="h-32 bg-muted" />
            </div>
        </div>
      )}
       <Separator />
      {isTracker ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="new-imeis-textarea">Add New IMEIs (one per line)</Label>
            <Textarea
              id="new-imeis-textarea"
              value={newImeis}
              onChange={(e) => setNewImeis(e.target.value)}
              className="h-32"
              placeholder={`Paste new IMEIs here...`}
            />
            <p className="text-sm text-muted-foreground mt-2">
              New Quantity: {newImeis.split('\n').filter(i => i.trim()).length}
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Wire Harness (required)</Label>
            <Select
              value={selectedHarnessId}
              onValueChange={setSelectedHarnessId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select wire harness..." />
              </SelectTrigger>
              <SelectContent>
                {harnessOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Relay (optional)</Label>
              <Select
                value={selectedRelayId}
                onValueChange={setSelectedRelayId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select relay..." />
                </SelectTrigger>
                <SelectContent>
                  {relayOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mic (optional)</Label>
              <Select
                value={selectedMicId}
                onValueChange={setSelectedMicId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mic..." />
                </SelectTrigger>
                <SelectContent>
                  {micOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>SOS Button (optional)</Label>
              <Select
                value={selectedSosId}
                onValueChange={setSelectedSosId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select SOS button..." />
                </SelectTrigger>
                <SelectContent>
                  {sosOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label htmlFor="new-sims-textarea">Add New SIMs</Label>
                <Textarea id="new-sims-textarea" value={newSimNumbers} onChange={(e) => setNewSimNumbers(e.target.value)} className="h-32" placeholder={`Paste new SIM numbers here...`} />
                 <p className="text-sm text-muted-foreground mt-2">New Quantity: {newSimNumbers.split('\n').filter(i => i.trim()).length}</p>
            </div>
            <div>
                <Label htmlFor="new-imsis-textarea">Add New IMSIs</Label>
                <Textarea id="new-imsis-textarea" value={newImsis} onChange={(e) => setNewImsis(e.target.value)} className="h-32" placeholder={`Matching IMSIs here...`} />
            </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={handleSave}>Add to Stock</Button>
      </div>
    </div>
  );
};


const SimManager = ({ item, setDialogOpen, mutateItems }: { item: InventoryItem; setDialogOpen: (open: boolean) => void; mutateItems: () => void }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [sims, setSims] = useState<SimCard[]>(item.sims || []);
    const [editingSimNumber, setEditingSimNumber] = useState<string | null>(null);
    const [editingImsi, setEditingImsi] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const filteredSims = useMemo(() => {
        if (!searchTerm) return sims;
        return sims.filter(sim => 
            sim.simNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
            sim.imsi.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [sims, searchTerm]);

    const handleEdit = (sim: SimCard) => {
        setEditingSimNumber(sim.simNumber);
        setEditingImsi(sim.imsi);
    };

    const handleSave = async (originalSimNumber: string) => {
        if (!user) return;
        const updatedSims = sims.map(s =>
            s.simNumber === originalSimNumber ? { ...s, imsi: editingImsi } : s
        );

        try {
            await axios.put('/api/inventory', { id: item.id, sims: updatedSims });
            await addLog(`Updated IMSI for SIM ${originalSimNumber} in ${item.name}`, user.name, 'update');
            setSims(updatedSims);
            setEditingSimNumber(null);
            mutateItems();
            toast({ title: 'IMSI Updated', description: `The IMSI for ${originalSimNumber} has been saved.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.response?.data?.message || error.message });
        }
    };

    const handleDelete = async (simNumber: string) => {
        if (!user) return;
        const updatedSims = sims.filter(s => s.simNumber !== simNumber);

        try {
            await axios.put('/api/inventory', { id: item.id, sims: updatedSims, quantity: updatedSims.length });
            await addLog(`Deleted SIM ${simNumber} from ${item.name}`, user.name, 'delete');
            setSims(updatedSims);
            mutateItems();
            toast({ title: 'SIM Deleted', description: `SIM ${simNumber} has been removed.` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Delete Failed', description: error.response?.data?.message || error.message });
        }
    };


    return (
        <div className="space-y-4">
             <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search by SIM or IMSI..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">

                <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-x-4 px-2 font-medium text-sm">
                    <span>SIM Number</span>
                    <span>IMSI</span>
                    <span className="sr-only">Actions</span>
                </div>
                {filteredSims.map((sim) => (
                    <div key={sim.simNumber} className="grid grid-cols-[1fr_1fr_auto] items-center gap-x-4 p-2 rounded-md hover:bg-muted">
                        <span className="text-sm font-mono">{sim.simNumber}</span>
                        {editingSimNumber === sim.simNumber ? (
                            <Input
                                value={editingImsi}
                                onChange={(e) => setEditingImsi(e.target.value)}
                                className="h-8"
                            />
                        ) : (
                            <span className="text-sm font-mono">{sim.imsi}</span>
                        )}
                        <div className="flex gap-2">
                            {editingSimNumber === sim.simNumber ? (
                                <Button variant="ghost" size="icon" onClick={() => handleSave(sim.simNumber)}>
                                    <Save className="h-4 w-4 text-green-600" />
                                </Button>
                            ) : (
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(sim)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(sim.simNumber)}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
             <div className="flex justify-end pt-4">
                <Button onClick={() => setDialogOpen(false)}>Done</Button>
            </div>
        </div>
    );
};


export default function InventoryList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [isNumberManagerOpen, setIsNumberManagerOpen] = useState(false);
  const [isSimManagerOpen, setIsSimManagerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const { inventoryItems: items, isLoading: isLoadingInventory, isError: errorInventory, mutate: mutateItems } = useInventory();
  const { sales, isLoading: isLoadingSales } = useSales();
  const { stockAllocations: allocations, isLoading: isLoadingAllocations } = useStockAllocations();
  const { pinStatus: userPin } = useUserPin(user?.traccarId);

  const consumptionMap = useMemo(() => {
    const map = new Map<string, number>();
    if (sales) {
      for (const sale of sales) {
        if (sale.trackerId) {
          map.set(sale.trackerId, (map.get(sale.trackerId) || 0) + 1);
        }
        if (sale.simId) {
          map.set(sale.simId, (map.get(sale.simId) || 0) + 1);
        }
        const consumedAccessoryIds = [
          sale.harnessId,
          sale.relayId,
          sale.micId,
          sale.sosButtonId,
        ].filter(id => id && id !== 'not-used');
        
        for (const id of consumedAccessoryIds) {
           map.set(id, (map.get(id) || 0) + 1);
        }
      }
    }
    return map;
  }, [sales]);

  const allocationMap = useMemo(() => {
    const map = new Map<string, number>();
    if (Array.isArray(allocations)) {
      for (const allocation of allocations) {
        map.set(allocation.inventoryItemId, (map.get(allocation.inventoryItemId) || 0) + allocation.quantity);
      }
    }
    return map;
  }, [allocations]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const categoryMatch = categoryFilter === 'all' || item.type === categoryFilter;
      return nameMatch && categoryMatch;
    });
  }, [items, searchTerm, categoryFilter]);
  
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredItems.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredItems, currentPage]);

  const totalPages = Math.ceil(filteredItems.length / RECORDS_PER_PAGE);

  const totalStockValue = useMemo(() => {
    if (!items) return 0;
    return items.reduce((acc, item) => acc + (item.quantity * (item.cost || 0)), 0);
  }, [items]);


  const openDeleteDialog = (item: InventoryItem) => {
    setSelectedItem(item);
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

  const openNumberManager = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsNumberManagerOpen(true);
  };
  
  const openSimManager = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsSimManagerOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedItem || !user) return;

    try {
        await axios.delete(`/api/inventory?id=${selectedItem.id}`);
        await addLog(`Deleted inventory item and linked expenses for: "${selectedItem.name}"`, user.name, 'delete');
        mutateItems();
        toast({
            title: "Item Deleted",
            description: `Successfully removed "${selectedItem.name}" and its linked expenses from inventory.`,
        });
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Deletion Failed",
            description: error.response?.data?.message || error.message || "An unexpected error occurred."
        });
    } finally {
        setSelectedItem(null);
        setIsAlertOpen(false);
        setIsPinDialogOpen(false);
    }
  };

  const handleExport = () => {
    if (!items || items.length === 0) {
      toast({
        variant: "destructive",
        title: "No Inventory to Export",
        description: "There are no items to export.",
      });
      return;
    }

    const header = [ "id", "name", "type", "quantity", "cost", "supplier", "imeis", "sims" ];
    const csvRows = [
      header.join(","),
      ...items.map((item) => {
        const imeis = `"${(item.imeis || []).join(";")}"`; // Use semicolon for multi-value fields
        const sims = `"${(item.sims || []).map(s => `${s.simNumber}:${s.imsi}`).join(";")}"`;
        
        return [
          item.id,
          `"${item.name.replace(/"/g, '""')}"`,
          item.type,
          item.quantity,
          item.cost || 0,
          `"${(item.supplier || "").replace(/"/g, '""')}"`,
          imeis,
          sims,
        ].join(",");
      }),
    ];
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStr = format(new Date(), "yyyy-MM-dd");
    link.setAttribute("download", `inventory-export-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatItemType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const itemTypes = useMemo(() => {
    if (!items) return [];
    return [...new Set(items.map(item => item.type))];
  }, [items]);

  const isLoading = isLoadingInventory || isLoadingSales || isLoadingAllocations;
  const error = errorInventory;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Stock</CardTitle>
          <CardDescription>Fetching your inventory...</CardDescription>
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

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Stock</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load inventory</AlertTitle>
            <AlertDescription>
              There was a problem fetching your inventory data. Please check
              your connection and try again.
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
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <CardTitle>Current Stock</CardTitle>
                <CardDescription>
                  A list of all items in your inventory.
                  Total stock value: <span className="font-semibold text-primary">PKR {totalStockValue.toLocaleString()}</span>
                </CardDescription>
              </div>
               <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export to CSV
              </Button>
          </div>
           <div className="flex items-center gap-2 pt-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by item name..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Total Stock</TableHead>
                <TableHead>Allocated</TableHead>
                <TableHead>Central Stock</TableHead>
                <TableHead>Consumed</TableHead>
                <TableHead>Unit Cost</TableHead>
                <TableHead>Total Value</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems && paginatedItems.length > 0 ? (
                paginatedItems.map((item) => {
                  const consumed = consumptionMap.get(item.id) || 0;
                  const allocated = allocationMap.get(item.id) || 0;
                  const centralStock = item.quantity - allocated - consumed;
                  return(
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {formatItemType(item.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{allocated}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{centralStock} available for allocation</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>{centralStock}</TableCell>
                    <TableCell>{consumed}</TableCell>
                    <TableCell>
                      {item.cost ? `PKR ${item.cost.toLocaleString()}` : 'N/A'}
                    </TableCell>
                     <TableCell className="font-semibold">
                      {item.cost ? `PKR ${(item.quantity * item.cost).toLocaleString()}` : 'N/A'}
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
                          {item.type === 'tracker' && (
                            <DropdownMenuItem onClick={() => openNumberManager(item)}>
                              <ListPlus className="mr-2 h-4 w-4" />
                              Add More IMEIs
                            </DropdownMenuItem>
                          )}
                           {item.type === 'sim' && (
                            <>
                               <DropdownMenuItem onClick={() => openNumberManager(item)}>
                                <ListPlus className="mr-2 h-4 w-4" />
                                Add More SIMs
                               </DropdownMenuItem>
                               <DropdownMenuItem onClick={() => openSimManager(item)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Manage SIMs
                               </DropdownMenuItem>
                            </>
                           )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            onClick={() => openDeleteDialog(item)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Warehouse className="h-8 w-8" />
                      <p>No inventory items found.</p>
                      <p className="text-xs">
                        Try adjusting your search or filters.
                      </p>
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
              This action cannot be undone. This will permanently delete this
              item and its associated stock purchase expense from your records.
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
        actionDescription={`delete inventory item: ${selectedItem?.name}`}
      />
      
      <Dialog open={isNumberManagerOpen} onOpenChange={setIsNumberManagerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add More Stock to {selectedItem?.name}</DialogTitle>
            <DialogDescription>
             Add new items to this existing stock. The quantity will be updated automatically.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && items && (
            <NumberManager
              item={selectedItem}
              allItems={items}
              setDialogOpen={setIsNumberManagerOpen}
              mutateItems={mutateItems}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isSimManagerOpen} onOpenChange={setIsSimManagerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage SIMs for {selectedItem?.name}</DialogTitle>
            <DialogDescription>
             Correct the IMSI for a SIM card or delete a pair from stock.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <SimManager
              item={selectedItem}
              setDialogOpen={setIsSimManagerOpen}
              mutateItems={mutateItems}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
