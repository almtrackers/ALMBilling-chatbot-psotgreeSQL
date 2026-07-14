
'use client';

import { useState } from 'react';
import { useOffices } from '@/hooks/use-offices';
import axios from 'axios';
import type { Office } from '@/lib/types';
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
import { ServerCrash, MoreHorizontal, Building, Trash2 } from 'lucide-react';
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

export default function OfficeList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { offices, isLoading, isError: error, mutate } = useOffices();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<Office | null>(null);

  const openDeleteDialog = (office: Office) => {
    setSelectedOffice(office);
    setIsAlertOpen(true);
  };

  const handleDelete = async () => {
    if (selectedOffice && user) {
      try {
        await axios.delete(`/api/offices?id=${selectedOffice.id}`);
        await addLog(`Deleted office: "${selectedOffice.name}"`, user.name, 'delete');
        toast({
          title: 'Office Deleted',
          description: `The office "${selectedOffice.name}" has been removed.`,
        });
        mutate();
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: err.response?.data?.message || 'Failed to delete office',
        });
      }
      setSelectedOffice(null);
    }
    setIsAlertOpen(false);
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
          <CardTitle>Offices</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load offices</AlertTitle>
            <AlertDescription>
              There was a problem fetching your office data.
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
          <CardTitle>Office Locations</CardTitle>
          <CardDescription>A list of all your registered offices.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Office Name</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offices && offices.length > 0 ? (
                offices.map((office) => (
                  <TableRow key={office.id}>
                    <TableCell className="font-medium">{office.name}</TableCell>
                    <TableCell>
                      {office.createdAt
                        ? format(typeof office.createdAt === 'string' ? parseISO(office.createdAt) : new Date(office.createdAt), 'PPP')
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
                            onClick={() => openDeleteDialog(office)}
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
                  <TableCell colSpan={3} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Building className="h-8 w-8" />
                      <p>No offices found.</p>
                      <p className="text-xs">Use the "Add Office" button to create one.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Deleting an office may affect stock allocation records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Yes, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
