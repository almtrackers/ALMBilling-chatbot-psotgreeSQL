'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ShieldAlert, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';

type TraccarUserOption = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  administrator?: boolean;
  userLimit?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export default function CreateWalletDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const [traccarUsers, setTraccarUsers] = useState<TraccarUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TraccarUserOption | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSearch('');
    setLoadingUsers(true);
    apiClient
      .get<TraccarUserOption[]>('/users')
      .then((res) => setTraccarUsers(res.data || []))
      .catch(() =>
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load Traccar users.',
        })
      )
      .finally(() => setLoadingUsers(false));
  }, [open, toast]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return traccarUsers;
    return traccarUsers.filter(
      (u) =>
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.phone?.includes(term) ||
        String(u.id) === term
    );
  }, [traccarUsers, search]);

  const isStaff = (u: TraccarUserOption) =>
    Boolean(u.administrator) || (typeof u.userLimit === 'number' && u.userLimit !== 0);

  const createWallet = async (payload: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to create wallet');
      toast({
        title: 'Wallet created',
        description: `Wallet for ${data.wallet.name} created. Balance: PKR ${Number(data.wallet.balance).toLocaleString()}`,
      });
      onOpenChange(false);
      onCreated();
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Create failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Wallet</DialogTitle>
          <DialogDescription>
            Admin/manager accounts are never added automatically — create their wallets here when
            needed.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="traccar">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="traccar">From Traccar user</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="traccar" className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone or ID..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="h-64 rounded-md border">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading users...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No Traccar users found.
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60',
                        selected?.id === u.id && 'bg-muted'
                      )}
                      onClick={() => setSelected(u)}
                    >
                      <div>
                        <div className="font-medium">{u.name || `User ${u.id}`}</div>
                        <div className="text-xs text-muted-foreground">
                          #{u.id} · {u.email || u.phone || 'no contact'}
                        </div>
                      </div>
                      {isStaff(u) && (
                        <Badge variant="outline" className="gap-1 text-amber-600">
                          <ShieldAlert className="h-3 w-3" />
                          {u.administrator ? 'Admin' : 'Manager'}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!selected || isSaving}
                onClick={() => selected && createWallet({ traccarId: selected.id })}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Create Wallet
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="Customer name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                placeholder="03001234567"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                placeholder="name@example.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!manualName.trim() || isSaving}
                onClick={() =>
                  createWallet({
                    name: manualName.trim(),
                    phone: manualPhone.trim() || undefined,
                    email: manualEmail.trim() || undefined,
                  })
                }
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Create Wallet
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
