
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCrash, Search, PlusCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { Badge } from '@/components/ui/badge';
import UserActionsCell from '@/components/dashboard/users/user-actions-cell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger
} from '@/components/ui/dialog';
import CreateUserForm from '@/components/dashboard/users/create-user-form';
import { ClientDocumentActions } from '@/components/dashboard/users/client-document-actions';

const RECORDS_PER_PAGE = 15;

type ClientDoc = {
  id: number;
  traccarId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  cnic: string | null;
  cnicFrontPath: string | null;
  cnicBackPath: string | null;
};

export default function UsersPage() {
  const { users, isLoading: isLoadingUsers, isError: isErrorUsers, mutate: mutateUsers } = useTraccarUsers();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [clients, setClients] = useState<ClientDoc[]>([]);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      setClients(json.clients || []);
    } catch {
      // ignore — page still works without doc metadata
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const clientsByTraccarId = useMemo(() => {
    const map = new Map<number, ClientDoc>();
    clients.forEach((c) => {
      if (c.traccarId != null) map.set(c.traccarId, c);
    });
    return map;
  }, [clients]);

  const clientsByName = useMemo(() => {
    const map = new Map<string, ClientDoc>();
    clients.forEach((c) => map.set(c.name.toLowerCase(), c));
    return map;
  }, [clients]);

  const findClient = useCallback(
    (traccarId: number, name: string) =>
      clientsByTraccarId.get(traccarId) || clientsByName.get(name.toLowerCase()) || null,
    [clientsByTraccarId, clientsByName]
  );

  const filteredUsers = useMemo(() => {
    const allStandardUsers = users?.filter((user) => !user.administrator && !user.manager) || [];
    if (!searchTerm) return allStandardUsers;
    const lowercasedTerm = searchTerm.toLowerCase();
    return allStandardUsers.filter((user) => {
      const client = findClient(user.id, user.name);
      return (
        user.name.toLowerCase().includes(lowercasedTerm) ||
        user.email?.toLowerCase().includes(lowercasedTerm) ||
        client?.cnic?.toLowerCase().includes(lowercasedTerm)
      );
    });
  }, [users, searchTerm, findClient]);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const totalPages = Math.ceil(filteredUsers.length / RECORDS_PER_PAGE);

  if (isLoadingUsers) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" description="Loading user accounts from the server..." />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isErrorUsers) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" />
        <Alert variant="destructive">
          <ServerCrash className="h-4 w-4" />
          <AlertTitle>Could not load user data</AlertTitle>
          <AlertDescription>
            There was a problem fetching user accounts from the server. Please check the connection
            and try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="A list of all standard (non-admin) user accounts.">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, email, or CNIC..."
              className="pl-8 w-full sm:w-[200px] md:w-[300px]"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Standard User</DialogTitle>
                <DialogDescription>
                  CNIC and CNIC front/back images are required. Access is read-only by default.
                </DialogDescription>
              </DialogHeader>
              <CreateUserForm
                setDialogOpen={setIsCreateDialogOpen}
                onUserCreated={() => {
                  mutateUsers();
                  loadClients();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Standard Users</CardTitle>
          <CardDescription>
            Found {filteredUsers.length} standard user accounts on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>CNIC</TableHead>
                <TableHead>CNIC Front</TableHead>
                <TableHead>CNIC Back</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Readonly</TableHead>
                <TableHead>Device Limit</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedUsers.length > 0 ? (
                paginatedUsers.map((user) => {
                  const client = findClient(user.id, user.name);
                  return (
                    <TableRow key={user.id}>
                      <TableCell>{user.id}</TableCell>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {client?.cnic || (
                          <span className="text-muted-foreground">No document uploaded</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ClientDocumentActions
                          clientId={client?.id ?? null}
                          kind="cnic_front"
                          hasDocument={!!client?.cnicFrontPath}
                          onReplaced={loadClients}
                        />
                      </TableCell>
                      <TableCell>
                        <ClientDocumentActions
                          clientId={client?.id ?? null}
                          kind="cnic_back"
                          hasDocument={!!client?.cnicBackPath}
                          onReplaced={loadClients}
                        />
                      </TableCell>
                      <TableCell>
                        {user.disabled ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : (
                          <Badge className="bg-green-500">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>{user.readonly ? 'Yes' : 'No'}</TableCell>
                      <TableCell>
                        {user.deviceLimit === -1 ? 'Unlimited' : user.deviceLimit}
                      </TableCell>
                      <TableCell>
                        <UserActionsCell userId={user.id} userName={user.name} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center">
                    No standard user accounts found.
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
    </div>
  );
}
