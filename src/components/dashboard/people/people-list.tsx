
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import type { Person, Expense } from '@/lib/types';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { ServerCrash, MoreHorizontal, User, Trash2, Edit } from 'lucide-react';
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
import { usePersons } from '@/hooks/use-persons';
import { useExpenses } from '@/hooks/use-expenses';
import PinDialog from '@/components/auth/pin-dialog';
import EditPersonForm from './edit-person-form';

const RECORDS_PER_PAGE = 15;

export default function PeopleList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { persons: people, isLoading: isLoadingPeople, isError: errorPeople, mutate: mutatePeople } = usePersons();
  const { expenses, isLoading: isLoadingExpenses, isError: errorExpenses } = useExpenses();

  const paginatedPeople = useMemo(() => {
    if (!people) return [];
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return people.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [people, currentPage]);

  const totalPages = Math.ceil((people?.length || 0) / RECORDS_PER_PAGE);

  const peopleBalances = useMemo(() => {
    const balances = new Map<string, { totalIncoming: number, totalOutgoing: number, balance: number }>();
    if (!people || !expenses) return balances;

    people.forEach(p => {
        balances.set(p.id, { totalIncoming: 0, totalOutgoing: 0, balance: 0 });
    });

    expenses.forEach(expense => {
        if(expense.personId && balances.has(expense.personId)) {
            const current = balances.get(expense.personId)!;
            if (expense.transactionType === 'incoming') {
                current.totalIncoming += expense.amount;
            } else {
                current.totalOutgoing += expense.amount;
            }
            current.balance = current.totalIncoming - current.totalOutgoing;
        }
    });

    return balances;
  }, [people, expenses]);

  const openEditDialog = (e: React.MouseEvent, person: Person) => {
    e.stopPropagation();
    setSelectedPerson(person);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (e: React.MouseEvent, person: Person) => {
    e.stopPropagation();
    setSelectedPerson(person);
    setIsAlertOpen(true);
  };
  
  const confirmDeletion = () => {
    setIsAlertOpen(false);
    setIsPinDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedPerson || !user) return;
    try {
      await axios.delete(`/api/people?id=${selectedPerson.id}`);
      await addLog(`Deleted person: "${selectedPerson.name}"`, user.name, 'delete');
      toast({
        title: 'Person Deleted',
        description: `${selectedPerson.name} has been removed from your records.`,
      });
      mutatePeople();
      setSelectedPerson(null);
    } catch (error: any) {
      console.error("Delete person failed:", error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete person',
      });
    }
    setIsPinDialogOpen(false);
  };

  const isLoading = isLoadingPeople || isLoadingExpenses;
  const error = errorPeople || errorExpenses;

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
          <CardTitle>People</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load people</AlertTitle>
            <AlertDescription>
              There was a problem fetching data.
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
          <CardTitle>People List</CardTitle>
          <CardDescription>A list of all employees and partners. Transactions can be viewed in the Expenses page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPeople && paginatedPeople.length > 0 ? (
                paginatedPeople.map((person) => {
                  const personBalance = peopleBalances.get(person.id) || { balance: 0, totalIncoming: 0, totalOutgoing: 0 };
                  const { balance, totalIncoming, totalOutgoing } = personBalance;

                  return (
                    <TableRow key={person.id}>
                      <TableCell className="font-medium">{person.name}</TableCell>
                      <TableCell>{person.phone}</TableCell>
                      <TableCell>
                        <Badge variant={person.type === 'employee' ? 'default' : 'secondary'} className="capitalize">{person.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className={`font-semibold ${balance < 0 ? 'text-destructive' : ''}`}>
                              PKR {balance ? balance.toLocaleString() : '0'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                              In: {totalIncoming ? totalIncoming.toLocaleString() : '0'} | Out: {totalOutgoing ? totalOutgoing.toLocaleString() : '0'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={person.status === 'active' ? 'outline' : 'destructive'} className="capitalize">{person.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {person.createdAt
                          ? format(typeof person.createdAt === 'string' ? parseISO(person.createdAt) : new Date(person.createdAt), 'PPP')
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={(e) => openEditDialog(e, person)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => openDeleteDialog(e, person)}>
                              <Trash2 className="mr-2 h-4 w-4" />
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
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <User className="h-8 w-8" />
                      <p>No people found.</p>
                      <p className="text-xs">Use the "Add Person" button to get started.</p>
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
              This action cannot be undone. This will permanently delete {selectedPerson?.name}'s record and all associated ledger entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDeletion}
            >
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PinDialog
        open={isPinDialogOpen}
        onOpenChange={setIsPinDialogOpen}
        onSuccess={handleDelete}
        actionDescription={`delete person: ${selectedPerson?.name}`}
      />

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Person</DialogTitle>
            <DialogDescription>Update the details for {selectedPerson?.name}.</DialogDescription>
          </DialogHeader>
          {selectedPerson && <EditPersonForm person={selectedPerson} setDialogOpen={setIsEditDialogOpen} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
