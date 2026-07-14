'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
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

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<WalletUser | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [updateAmount, setUpdateAmount] = useState('');
  const [updateDescription, setUpdateDescription] = useState('');
  const [updateType, setUpdateType] = useState<'credit' | 'debit'>('credit');
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [isFixedBillDialogOpen, setIsFixedBillDialogOpen] = useState(false);
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

  useEffect(() => {
    fetchWallets();
  }, []);

  const handleUpdateBalance = async () => {
    if (!selectedWallet || !updateAmount) return;

    const amountNum = parseFloat(updateAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Please enter a valid positive number.' });
      return;
    }

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

  const filteredWallets = wallets.filter(w =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.phone?.includes(searchTerm) ||
    w.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet Management"
        description="Manage user balances and per-device billing settings."
      >
        <Button onClick={fetchWallets} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </PageHeader>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone or email..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Devices</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading wallets...
                  </TableCell>
                </TableRow>
              ) : filteredWallets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No wallets found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredWallets.map((wallet) => (
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
                        onClick={() => {
                          setSelectedWallet(wallet);
                          setIsHistoryDialogOpen(true);
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

      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transaction History - {selectedWallet?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedWallet?.transactions?.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs">{format(new Date(tx.createdAt), 'dd MMM yyyy HH:mm')}</TableCell>
                    <TableCell className="text-sm">{tx.description}</TableCell>
                    <TableCell className={cn(
                      'font-mono text-sm',
                      tx.type === 'credit' ? 'text-green-600' : 'text-destructive'
                    )}>
                      {tx.type === 'credit' ? '+' : '-'}{tx.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{tx.balanceAfter.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {(!selectedWallet?.transactions || selectedWallet.transactions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      No recent transactions.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
