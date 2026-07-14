
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { CompanyVehicle } from '@/lib/types';
import useSWR from 'swr';
import { VehicleCardActions } from '@/components/dashboard/users/client-document-actions';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ServerCrash, Building, MoreHorizontal, Edit, Replace } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { useDevices } from '@/hooks/use-devices';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import PinDialog from '@/components/auth/pin-dialog';
import EditCompanyVehicleForm from './edit-company-vehicle-form';
import ReplaceHardwareDialog from '../sales/replace-hardware-dialog';
import { useCompanyVehicles } from '@/hooks/use-company-vehicles';
import { useUserPin } from '@/hooks/use-user-pin';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const RECORDS_PER_PAGE = 15;

const MaskedValue = ({ value, secondValue, isPassword }: { value: string; secondValue?: string; isPassword?: boolean }) => {
  const [isRevealed, setIsRevealed] = useState(false);

  if (!value) {
    return <span>N/A</span>;
  }
  
  const displayValue = secondValue ? `${value} / ${secondValue}` : value;
  const maskedValue = '••••••';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRevealed) return;
    setIsRevealed(true);
    navigator.clipboard.writeText(value);
  };

  return (
    <div 
      onClick={handleClick}
      onMouseLeave={() => setIsRevealed(false)}
      className="cursor-pointer"
      title="Click to reveal and copy"
    >
      {isRevealed ? displayValue : maskedValue}
    </div>
  );
};

export default function CompanyVehicleList({ searchTerm }: { searchTerm: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isReplaceHardwareDialogOpen, setIsReplaceHardwareDialogOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<CompanyVehicle | null>(null);
  const [deleteFromTraccar, setDeleteFromTraccar] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { companyVehicles: vehicles, isLoading, isError: error, mutate } = useCompanyVehicles();
  
  const { devices, mutate: mutateDevices } = useDevices();
  
  const { pinStatus: userPin } = useUserPin(user?.traccarId);

  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    if (!searchTerm) return vehicles;
    const lowercasedTerm = searchTerm.toLowerCase();
    return vehicles.filter(vehicle => 
      vehicle.customerName.toLowerCase().includes(lowercasedTerm) ||
      vehicle.vehicleNumber.toLowerCase().includes(lowercasedTerm)
    );
  }, [vehicles, searchTerm]);

  const paginatedVehicles = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredVehicles.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredVehicles, currentPage]);

  const totalPages = Math.ceil(filteredVehicles.length / RECORDS_PER_PAGE);

  const openEditDialog = (vehicle: CompanyVehicle) => {
    setSelectedVehicle(vehicle);
    setIsEditDialogOpen(true);
  };

  const openReplaceHardwareDialog = (vehicle: CompanyVehicle) => {
    setSelectedVehicle(vehicle);
    setIsReplaceHardwareDialogOpen(true);
  };

  const openDeleteDialog = (vehicle: CompanyVehicle) => {
    setSelectedVehicle(vehicle);
    setDeleteFromTraccar(false);
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
    if (!selectedVehicle || !user) return;

    try {
      if (deleteFromTraccar) {
        const deviceToDelete = devices?.find(d => d.uniqueId === selectedVehicle.imei);
        if (deviceToDelete) {
          try {
            await apiClient.delete(`/devices/${deviceToDelete.id}`);
            toast({
              title: 'Device Deleted from Server',
              description: `Device ${deviceToDelete.name} has been removed.`,
            });
            mutateDevices();
            await addLog(`Deleted server device ${deviceToDelete.name} during company vehicle deletion`, user.name, 'delete');
          } catch (traccarError: any) {
             if (traccarError?.response?.status !== 404) {
               throw new Error(`Server API responded with status ${traccarError?.response?.status}`);
            }
          }
        }
      }

      const response = await fetch(`/api/company-vehicles/${selectedVehicle.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await mutate();
      await addLog(`Deleted company vehicle record #${selectedVehicle.id} for ${selectedVehicle.vehicleNumber}`, user.name, 'delete');
      
      toast({
        title: 'Company Vehicle Deleted',
        description: 'The record has been removed.',
      });

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Deletion Failed',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setSelectedVehicle(null);
      setIsPinDialogOpen(false);
    }
  };


  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Vehicle List</CardTitle>
          <CardDescription>Fetching your company vehicles...</CardDescription>
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
          <CardTitle>Company Vehicle List</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load vehicles</AlertTitle>
            <AlertDescription>
              There was a problem fetching your data. Please check your
              connection and try again.
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
        <CardTitle>Company Vehicle List</CardTitle>
        <CardDescription>
          A list of all sales marked as a company vehicle.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver/Dept.</TableHead>
              <TableHead>Vehicle No.</TableHead>
              <TableHead>IMEI</TableHead>
              <TableHead>SIM / IMSI</TableHead>
              <TableHead>Password</TableHead>
              <TableHead>Alert Number</TableHead>
              <TableHead>Contact Number</TableHead>
              <TableHead>Installation Date</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vehicle Card</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedVehicles && paginatedVehicles.length > 0 ? (
              paginatedVehicles.map((vehicle) => {
                const device = devices?.find(d => d.uniqueId === vehicle.imei);
                const devicePassword = device?.attributes?.devicePassword;
                return (
                <TableRow key={vehicle.id}>
                  <TableCell className="font-medium">
                    {vehicle.customerName}
                  </TableCell>
                  <TableCell>{vehicle.vehicleNumber}</TableCell>
                   <TableCell>
                      <MaskedValue value={vehicle.imei || ''} />
                    </TableCell>
                    <TableCell>
                      <MaskedValue value={vehicle.simNumber || ''} secondValue={vehicle.imsi} />
                    </TableCell>
                  <TableCell>
                    {devicePassword ? <MaskedValue value={devicePassword} isPassword /> : 'N/A'}
                  </TableCell>
                  <TableCell>{vehicle.phoneRobocall || 'N/A'}</TableCell>
                  <TableCell>{vehicle.contactNumber || 'N/A'}</TableCell>
                  <TableCell>
                    {vehicle.date
                      ? format(new Date(vehicle.date), 'PPP')
                      : 'Invalid Date'}
                  </TableCell>
                  <TableCell>
                    {vehicle.date
                      ? format(new Date(vehicle.date), 'PP')
                      : 'Invalid Date'}
                  </TableCell>
                  <TableCell>
                    <VehicleCardActions
                      type="company"
                      id={vehicle.id}
                      hasDocument={!!vehicle.vehicleCardPath}
                      onReplaced={() => mutate()}
                    />
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
                         <DropdownMenuItem onClick={() => openEditDialog(vehicle)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openReplaceHardwareDialog(vehicle)}>
                          <Replace className="mr-2 h-4 w-4" />
                          Replace Hardware
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600 focus:bg-red-50"
                          onClick={() => openDeleteDialog(vehicle)}
                        >
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
                <TableCell colSpan={10} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Building className="h-8 w-8" />
                    <p>No company vehicles found.</p>
                     {searchTerm ? (
                        <p className="text-xs">No vehicles match your search for "{searchTerm}".</p>
                      ) : (
                        <p className="text-xs">
                          Mark a sale as a "Company Vehicle" in the add sale form.
                        </p>
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
              This will permanently delete the record. You can also choose to delete the device from the server.
            </AlertDialogDescription>
            <div className="flex items-center space-x-2 pt-4">
                <Checkbox 
                    id="delete-traccar-checkbox" 
                    checked={deleteFromTraccar}
                    onCheckedChange={(checked) => setDeleteFromTraccar(Boolean(checked))}
                />
                <Label htmlFor="delete-traccar-checkbox" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Also delete device from server
                </Label>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDeletion}
            >
              Confirm Deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <PinDialog
        open={isPinDialogOpen}
        onOpenChange={setIsPinDialogOpen}
        onSuccess={handleDelete}
        actionDescription={`delete company vehicle ${selectedVehicle?.vehicleNumber}`}
      />

       <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Company Vehicle</DialogTitle>
            <DialogDescription>
              Update vehicle details and device information on the server.
            </DialogDescription>
          </DialogHeader>
          {selectedVehicle && <EditCompanyVehicleForm vehicle={selectedVehicle} setDialogOpen={setIsEditDialogOpen} />}
        </DialogContent>
      </Dialog>

      <ReplaceHardwareDialog
        open={isReplaceHardwareDialogOpen}
        onOpenChange={setIsReplaceHardwareDialogOpen}
        companyVehicle={selectedVehicle}
      />
    </>
  );
}
