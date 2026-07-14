
'use client';

import { useState } from 'react';
import { useEmployees } from '@/hooks/use-employees';
import axios from 'axios';
import type { Employee } from '@/lib/types';
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
import { ServerCrash, MoreHorizontal, User, Trash2 } from 'lucide-react';
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

export default function EmployeeList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { employees, isLoading, isError: error, mutate } = useEmployees();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const openDeleteDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsAlertOpen(true);
  };

  const handleDelete = async () => {
    if (selectedEmployee && user) {
      try {
        await axios.delete(`/api/employees?id=${selectedEmployee.id}`);
        await addLog(`Deleted employee: "${selectedEmployee.name}"`, user.name, 'delete');
        toast({
          title: 'Employee Deleted',
          description: `The employee "${selectedEmployee.name}" has been removed.`,
        });
        mutate();
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: err.response?.data?.message || 'Failed to delete employee',
        });
      }
      setSelectedEmployee(null);
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
          <CardTitle>Employees</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load employees</AlertTitle>
            <AlertDescription>
              There was a problem fetching your employee data.
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
          <CardTitle>Employee List</CardTitle>
          <CardDescription>A list of all your registered employees.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee Name</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees && employees.length > 0 ? (
                employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>{employee.phone}</TableCell>
                    <TableCell>
                      {employee.createdAt
                        ? format(typeof employee.createdAt === 'string' ? parseISO(employee.createdAt) : new Date(employee.createdAt), 'PPP')
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
                            onClick={() => openDeleteDialog(employee)}
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
                  <TableCell colSpan={4} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <User className="h-8 w-8" />
                      <p>No employees found.</p>
                      <p className="text-xs">Use the "Add Employee" button to create one.</p>
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
              This action cannot be undone. Deleting an employee may affect stock allocation records.
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
