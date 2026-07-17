'use client';

import { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Minus,
  Search,
  History,
  Settings2,
  RefreshCw,
  Smartphone,
  UserPlus,
  Calculator,
  AlertTriangle,
} from 'lucide-react';
import PinPromptDialog from '@/components/security/pin-prompt-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import CreateWalletDialog from '@/components/dashboard/wallets/create-wallet-dialog';
import WalletStatementDialog from '@/components/dashboard/wallets/wallet-statement-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { WalletUser, WalletDevice } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';

const WALLETS_PER_PAGE = 25;

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletUser[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [unlinkedDevices, setUnlinkedDevices] = useState<
    { id: number; name: string; uniqueId: string; ownerName: string | null; reason: string }[]
  >([]);
  const [showAllUnlinked, setShowAllUnlinked] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletUser | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [updateAmount, setUpdateAmount] = useState('');
  const [updateDescription, setUpdateDescription] = useState('');
  const [updateType, setUpdateType] = useState<'credit' | 'debit'>('credit');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [statementUserId, setStatementUserId] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [isFixedBillDialogOpen, setIsFixedBillDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [targetWalletId, setTargetWalletId] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<WalletDevice | null>(null);
  const [offlineHours, setOfflineHours] = useState<number>(0);
  const [total96PlusOfflineHours, setTotal96PlusOfflineHours] = useState<number>(0);
  const [deductHours, setDeductHours] = useState<string>('0');
  const [isFetchingOffline, setIsFetchingOffline] = useState(false);
  const { toast } = useToast();

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/list');
      const data = await res.json();
      if (data.success) {
        setWallets(data.wallets);
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to fetch wallets',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUnlinkedDevices = async () => {
    try {
      const res = await fetch('/api/wallet/unlinked-devices');
      const data = await res.json();
      if (data.success && Array.isArray(data.devices)) {
        setUnlinkedDevices(data.devices);
      }
    } catch {
      // Non-critical — the warning banner just stays hidden.
    }
  };

  useEffect(() => {
    fetchWallets();
    fetchUnlinkedDevices();
  }, []);

  const handleSyncBilling = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/wallet/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Sync failed');
      const s = data.stats;
      toast({
        title: 'Billing synced',
        description: `${s.devicesLinked} devices linked, ${s.debitsPosted} charges posted, ${s.creditsPosted} payments credited, ${s.invoicesAutoPaid} invoices auto-paid from surplus.${s.skippedStaff > 0 ? ` ${s.skippedStaff} staff-owned devices skipped (create wallet manually).` : ''}`,
      });
      fetchWallets();
      fetchUnlinkedDevices();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Sync Failed', description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  // Step 1: validate the form, then ask for the security PIN.
  const handleUpdateBalance = () => {
    if (!selectedWallet || !updateAmount) return;

    const amountNum = parseFloat(updateAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Please enter a valid positive number.' });
      return;
    }

    setIsPinDialogOpen(true);
  };

  // Step 2: perform the balance change with the verified PIN.
  const executeUpdateBalance = async (pin: string) => {
    if (!selectedWallet || !updateAmount) return;

    const amountNum = parseFloat(updateAmount);
    const finalAmount = updateType === 'credit' ? amountNum : -amountNum;

    try {
      const res = await fetch('/api/wallet/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactNumber: selectedWallet.phone,
          customerName: selectedWallet.name,
          amount: finalAmount,
          description: updateDescription || `${updateType === 'credit' ? 'Manual Credit' : 'Manual Debit'} by Admin`,
          pin,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Wallet Updated', description: `Successfully updated balance for ${selectedWallet.name}.` });
        setIsUpdateDialogOpen(false);
        setUpdateAmount('');
        setUpdateDescription('');
        fetchWallets();
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    }
  };

  const fetchOfflineHours = async (device: WalletDevice) => {
    setIsFetchingOffline(true);
    try {
      const res = await fetch(`/api/wallet/offline-hours?deviceId=${device.id}`);
      const data = await res.json();
      if (data.success) {
        setOfflineHours(data.totalOfflineHours);
        setTotal96PlusOfflineHours(data.total96PlusOfflineHours || 0);
        setDeductHours(Math.floor(data.totalOfflineHours).toString());
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsFetchingOffline(false);
    }
  };

  const handleFixedBill = async () => {
    if (!selectedDevice || deductHours === '') return;

    const hours = parseFloat(deductHours);
    if (isNaN(hours) || hours < 0 || hours > offlineHours) {
      toast({
        variant: 'destructive',
        title: 'Invalid Hours',
        description: `Please enter a value between 0 and ${offlineHours.toFixed(1)}.`,
      });
      return;
    }

    try {
      const res = await fetch('/api/wallet/fixed-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedDevice.id,
          deductHours: hours,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Concession Applied',
          description: `Successfully credited PKR ${data.concessionAmount.toLocaleString()} to wallet.`,
        });
        setIsFixedBillDialogOpen(false);
        fetchWallets();
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Operation Failed', description: error.message });
    }
  };

  const handleTransferDevice = async () => {
    if (!selectedDevice || !selectedWallet || !targetWalletId) return;
    setIsTransferring(true);
    try {
      const res = await fetch('/api/wallet/transfer-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedDevice.id,
          targetUserId: Number(targetWalletId),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Device transfer failed.');
      }

      toast({ title: 'Device Transferred', description: data.message });
      setIsTransferDialogOpen(false);
      setIsDeviceDialogOpen(false);
      setTargetWalletId('');
      setSelectedDevice(null);
      setSelectedWallet(null);
      await fetchWallets();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Transfer Failed',
        description: error.message || 'Could not transfer the device.',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const filteredWallets = wallets.filter(w => {
    const matchesSearch =
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.phone?.includes(searchTerm) ||
      w.email?.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    switch (balanceFilter) {
      case 'surplus':
        return w.balance > 0;
      case 'negative':
        return w.balance < 0;
      case 'zero':
        return w.balance === 0;
      case 'low':
        return w.lowBalanceWarning === true;
      default:
        return true;
    }
  });

  const totalPages = Math.max(1, Math.ceil(filteredWallets.length / WALLETS_PER_PAGE));

  const paginatedWallets = useMemo(() => {
    const startIndex = (currentPage - 1) * WALLETS_PER_PAGE;
    return filteredWallets.slice(startIndex, startIndex + WALLETS_PER_PAGE);
  }, [filteredWallets, currentPage]);

  // Reset to the first page when the search or filter changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, balanceFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet Management"
        description="Manage user balances and per-device billing settings."
      >
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsCreateDialogOpen(true)} variant="outline" size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Create Wallet
          </Button>
          <Button onClick={handleSyncBilling} size="sm" disabled={isSyncing}>
            <Calculator className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-pulse' : ''}`} />
            {isSyncing ? 'Calculating...' : 'Sync & Recalculate'}
          </Button>
          <Button onClick={fetchWallets} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </PageHeader>

      {unlinkedDevices.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {unlinkedDevices.length} vehicle{unlinkedDevices.length === 1 ? ' is' : 's are'} not
            connected to any wallet
          </AlertTitle>
          <AlertDescription>
            These vehicles are running without wallet billing (company vehicles excluded).
            <ul className="mt-2 list-none space-y-1">
              {(showAllUnlinked ? unlinkedDevices : unlinkedDevices.slice(0, 5)).map((device) => (
                <li
                  key={device.id}
                  className="flex flex-col gap-0.5 rounded-md border border-dashed border-red-300/50 bg-red-500/5 p-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <strong>{device.name}</strong>
                    <span className="ml-2 font-mono text-xs">IMEI: {device.uniqueId}</span>
                    {device.ownerName && (
                      <span className="ml-2 text-xs">Owner: {device.ownerName}</span>
                    )}
                  </span>
                  <span className="text-xs opacity-80">{device.reason}</span>
                </li>
              ))}
            </ul>
            {unlinkedDevices.length > 5 && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto p-0 text-destructive underline"
                onClick={() => setShowAllUnlinked((v) => !v)}
              >
                {showAllUnlinked
                  ? 'Show less'
                  : `Show all ${unlinkedDevices.length} vehicles`}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone or email..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={balanceFilter} onValueChange={setBalanceFilter}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Filter by balance..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Balances</SelectItem>
            <SelectItem value="surplus">Surplus Balance (&gt; 0)</SelectItem>
            <SelectItem value="negative">Negative Balance (&lt; 0)</SelectItem>
            <SelectItem value="zero">Zero Balance</SelectItem>
            <SelectItem value="low">Low for Next Billing ⚠️</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Upcoming Charges</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Devices</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading wallets...
                  </TableCell>
                </TableRow>
              ) : filteredWallets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No wallets found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedWallets.map((wallet) => (
                  <TableRow key={wallet.id}>
                    <TableCell>
                      <div className="font-medium">{wallet.name}</div>
                      <div className="text-xs text-muted-foreground">{wallet.email || 'No email'}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{wallet.phone || 'N/A'}</TableCell>
                    <TableCell>
                      <span className={cn(
                        'font-bold font-mono',
                        wallet.balance < 0 ? 'text-destructive' : 'text-green-600'
                      )}>
                        PKR {wallet.balance.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      {wallet.upcomingCharges && wallet.upcomingCharges > 0 ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-sm">
                            PKR {wallet.upcomingCharges.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {wallet.nextBillingDate
                              ? format(new Date(wallet.nextBillingDate), 'dd MMM yyyy')
                              : ''}
                          </div>
                          {wallet.lowBalanceWarning && (
                            <Badge variant="destructive" className="flex w-fit items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Balance low
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={wallet.status === 'active' ? 'default' : 'destructive'}>
                        {wallet.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex w-fit items-center gap-1">
                        <Smartphone className="h-3 w-3" />
                        {wallet.devices?.length || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedWallet(wallet);
                          setIsUpdateDialogOpen(true);
                          setUpdateType('credit');
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedWallet(wallet);
                          setIsUpdateDialogOpen(true);
                          setUpdateType('debit');
                        }}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Full statement & history sheet"
                        onClick={() => {
                          setStatementUserId(wallet.id);
                          setIsStatementDialogOpen(true);
                        }}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedWallet(wallet);
                          setIsDeviceDialogOpen(true);
                        }}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {!loading && filteredWallets.length > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * WALLETS_PER_PAGE + 1}
                {'–'}
                {Math.min(currentPage * WALLETS_PER_PAGE, filteredWallets.length)} of{' '}
                {filteredWallets.length} wallets
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
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
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{updateType === 'credit' ? 'Add Funds' : 'Deduct Funds'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer</label>
              <div className="p-2 bg-muted rounded font-medium">{selectedWallet?.name}</div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (PKR)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={updateAmount}
                onChange={(e) => setUpdateAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (Optional)</label>
              <Input
                placeholder="e.g., Cash Payment, Correction"
                value={updateDescription}
                onChange={(e) => setUpdateDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateBalance}>Confirm {updateType === 'credit' ? 'Add' : 'Deduct'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateWalletDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreated={fetchWallets}
      />

      <WalletStatementDialog
        userId={statementUserId}
        open={isStatementDialogOpen}
        onOpenChange={setIsStatementDialogOpen}
      />

      <Dialog open={isDeviceDialogOpen} onOpenChange={setIsDeviceDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Billing Devices - {selectedWallet?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Daily Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Billing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedWallet?.devices?.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">{device.name}</TableCell>
                    <TableCell className="capitalize">{device.planType}</TableCell>
                    <TableCell className="font-mono">PKR {device.planPrice.toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">PKR {device.dailyCost.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={device.status === 'active' ? 'default' : device.status === 'blocked' ? 'destructive' : 'outline'}>
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => {
                          setSelectedDevice(device);
                          setIsFixedBillDialogOpen(true);
                          fetchOfflineHours(device);
                        }}
                      >
                        Fixed Bill
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => {
                          setSelectedDevice(device);
                          setTargetWalletId('');
                          setIsTransferDialogOpen(true);
                        }}
                      >
                        Transfer
                      </Button>
                      <Select
                        value={device.status}
                        onValueChange={async (newStatus) => {
                          try {
                            const res = await fetch('/api/wallet/device-status', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ deviceId: device.id, status: newStatus }),
                            });
                            if (res.ok) {
                              toast({ title: 'Status Updated', description: 'Device billing status changed.' });
                              fetchWallets();
                            }
                          } catch {
                            toast({ variant: 'destructive', title: 'Error', description: 'Failed to update status.' });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[110px] h-8 text-xs ml-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
                {(!selectedWallet?.devices || selectedWallet.devices.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      No devices connected to this wallet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isTransferDialogOpen}
        onOpenChange={(open) => {
          setIsTransferDialogOpen(open);
          if (!open) setTargetWalletId('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Device</DialogTitle>
            <DialogDescription>
              Transfer {selectedDevice?.name} from {selectedWallet?.name} to another wallet.
              Existing charges and history remain in the current wallet; future billing continues
              in the destination wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <label className="text-sm font-medium">Destination Wallet</label>
            <Combobox
              options={wallets
                .filter(
                  (wallet) =>
                    wallet.id !== selectedWallet?.id && wallet.traccarId != null
                )
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((wallet) => ({
                  value: String(wallet.id),
                  label: `${wallet.name}${wallet.phone ? ` — ${wallet.phone}` : ''}${wallet.email ? ` (${wallet.email})` : ''}`,
                }))}
              value={targetWalletId}
              onChange={setTargetWalletId}
              placeholder="Select destination wallet..."
              searchPlaceholder="Search by name, phone or email..."
              noResultsMessage="No matching wallet found."
            />
            <p className="text-xs text-muted-foreground">
              Only wallets linked to a Traccar user can receive devices.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsTransferDialogOpen(false)}
              disabled={isTransferring}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransferDevice}
              disabled={!targetWalletId || isTransferring}
            >
              {isTransferring ? 'Transferring...' : 'Confirm Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFixedBillDialogOpen} onOpenChange={setIsFixedBillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fixed Bill Concession</DialogTitle>
            <DialogDescription>
              Deduct offline hours from the bill for {selectedDevice?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Plan Type</span>
                <p className="text-sm font-medium capitalize">{selectedDevice?.planType}</p>
              </div>
              <div className="space-y-1 text-right">
                <span className="text-xs text-muted-foreground">Daily Cost</span>
                <p className="text-sm font-medium">PKR {selectedDevice?.dailyCost.toFixed(2)}</p>
              </div>
            </div>

            <Card className="bg-muted/50 border-none shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Total Offline Time:</span>
                  {isFetchingOffline ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="font-mono text-blue-600 font-bold">{offlineHours.toFixed(1)} hrs</span>
                  )}
                </div>
                <div className="flex justify-between items-center border-t border-muted-foreground/10 pt-2">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium">Automatic (96h+):</span>
                    <p className="text-[10px] text-muted-foreground">Will be deducted at billing run</p>
                  </div>
                  {isFetchingOffline ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="font-mono text-orange-600 font-bold">{total96PlusOfflineHours.toFixed(1)} hrs</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <label className="text-sm font-medium">Hours to Deduct</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={deductHours}
                  onChange={(e) => setDeductHours(e.target.value)}
                  max={offlineHours}
                  placeholder="Enter hours"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeductHours(Math.floor(offlineHours).toString())}
                >
                  Max
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Estimated credit: PKR {((selectedDevice?.dailyCost || 0) / 24 * parseFloat(deductHours || '0')).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFixedBillDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleFixedBill}
              disabled={isFetchingOffline || parseFloat(deductHours) <= 0 || parseFloat(deductHours) > offlineHours}
            >
              Apply Concession
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PinPromptDialog
        open={isPinDialogOpen}
        onOpenChange={setIsPinDialogOpen}
        title="Confirm Wallet Balance Change"
        description={`Enter the security PIN to ${updateType === 'credit' ? 'add money to' : 'remove money from'} ${selectedWallet?.name || 'this wallet'}.`}
        onSuccess={executeUpdateBalance}
      />
    </div>
  );
}
