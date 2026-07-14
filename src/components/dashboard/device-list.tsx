
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useDevices } from '@/hooks/use-devices';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format, parseISO, differenceInDays, formatDistanceToNow } from 'date-fns';
import { ServerCrash, Search as SearchIcon } from 'lucide-react';
import type { Device, Sale, CompanyVehicle, InventoryItem, SimCard } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { addLog } from '@/lib/log-service';
import { useAuth } from '@/contexts/auth-context';
import { useCommandResultStore } from '@/store/command-result-store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import SendCommandDialog from './devices/SendCommandDialog';
import { getTraccarDeviceEvents } from '@/lib/api';
import { useSales } from '@/hooks/use-sales';
import { useCompanyVehicles } from '@/hooks/use-company-vehicles';
import { useInventory } from '@/hooks/use-inventory';
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

const RECORDS_PER_PAGE = 15;

type DeviceListProps = {
  searchTerm: string;
  statusFilter?: string[];
};


export default function DeviceList({ searchTerm, statusFilter = ['all'] }: DeviceListProps) {
  const { user } = useAuth();
  const { devices, isLoading: loadingDevices, isError } = useDevices();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);

  const { sales, isLoading: loadingSales } = useSales();
  const { companyVehicles, isLoading: loadingCompanyVehicles } = useCompanyVehicles();
  const { inventoryItems: inventory, isLoading: loadingInventory } = useInventory();

  const isLoading = loadingDevices || loadingSales || loadingCompanyVehicles || loadingInventory;

  const [isCommandDialogOpen, setIsCommandDialogOpen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [isImsiComparisonOpen, setIsImsiComparisonOpen] = useState(false);
  const [fetchedImsi, setFetchedImsi] = useState<string | null>(null);
  const [savedImsi, setSavedImsi] = useState<string | null>(null);
  const [recordToUpdate, setRecordToUpdate] = useState<{ type: 'sale' | 'companyVehicle', record: Sale | CompanyVehicle } | null>(null);

  const imeiToRecordMap = useMemo(() => {
    const map = new Map<string, { type: 'sale' | 'companyVehicle', record: Sale | CompanyVehicle }>();
    if (sales) {
      sales.forEach(s => map.set(s.imei, { type: 'sale', record: s }));
    }
    if (companyVehicles) {
      companyVehicles.forEach(cv => map.set(cv.imei, { type: 'companyVehicle', record: cv }));
    }
    return map;
  }, [sales, companyVehicles]);
  
  const imsiToSimMap = useMemo(() => {
      const map = new Map<string, SimCard>();
      if(inventory) {
          inventory.filter(i => i.type === 'sim').forEach(simItem => {
              simItem.sims?.forEach(sim => map.set(sim.imsi, sim));
          });
      }
      return map;
  }, [inventory]);



  const filteredDevices = useMemo(() => {
    if (!devices) return [];
    
    let filtered = devices;

    // Search term filter
    if (searchTerm) {
      filtered = filtered.filter(device =>
        device.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter && !statusFilter.includes('all')) {
      filtered = filtered.filter(device => {
        const billingExpiry = device.attributes?.expiryDate || device.expirationTime;
        const isExpired = billingExpiry && parseISO(billingExpiry) < new Date();
        
        return statusFilter.some(filter => {
          switch (filter) {
            case 'online':
              return device.status === 'online';
            case 'offline':
              return device.status === 'offline';
            case 'unknown':
              return device.status !== 'online' && device.status !== 'offline';
            case 'expired':
              return isExpired;
            default:
              return true;
          }
        });
      });
    }

    return filtered;
  }, [devices, searchTerm, statusFilter]);
  
  const paginatedDevices = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredDevices.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredDevices, currentPage]);

  const totalPages = Math.ceil(filteredDevices.length / RECORDS_PER_PAGE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-500 hover:bg-green-600">Online</Badge>;
      case 'offline':
        return <Badge variant="destructive">Offline</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getExpiryInfo = (device: any) => {
    const expiryDateStr = device.attributes?.expiryDate || device.expirationTime;
    if (!expiryDateStr) {
      return {
        text: 'N/A',
        badge: <Badge variant="secondary">No Expiry</Badge>,
      };
    }
    const expiryDate = parseISO(expiryDateStr);
    const daysLeft = differenceInDays(expiryDate, new Date());

    let badge;
    if (daysLeft < 0) {
      badge = (
        <Badge variant="destructive">
          Expired {Math.abs(daysLeft)} days ago
        </Badge>
      );
    } else if (daysLeft <= 30) {
      badge = (
        <Badge className="bg-yellow-500 hover:bg-yellow-600">
          {daysLeft} days
        </Badge>
      );
    } else {
      badge = (
        <Badge className="bg-green-500 hover:bg-green-600">
          {daysLeft} days
        </Badge>
      );
    }

    return {
      text: format(expiryDate, 'PPP'),
      badge,
    };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Device List</CardTitle>
          <CardDescription>Fetching your devices...</CardDescription>
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

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Device List</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load devices</AlertTitle>
            <AlertDescription>
              There was a problem fetching your device data. Please check your
              server connection and try again.
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
          <CardTitle>Device List</CardTitle>
          <CardDescription>
            A list of all your tracked devices from the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Update</TableHead>
                <TableHead>Subscription Expiry</TableHead>
                <TableHead>Expiry Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDevices && paginatedDevices.length > 0 ? (
                paginatedDevices.map((device) => {
                  const expiryInfo = getExpiryInfo(device);

                  return (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">
                        {device.name}
                      </TableCell>
                      <TableCell>
                         {device.status === 'offline' && device.lastUpdate ? (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Badge variant="destructive">Offline</Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Offline for {formatDistanceToNow(parseISO(device.lastUpdate), { addSuffix: true })}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            getStatusBadge(device.status)
                        )}
                      </TableCell>
                      <TableCell>
                        {device.lastUpdate
                          ? format(parseISO(device.lastUpdate), 'PPp')
                          : 'N/A'}
                      </TableCell>
                      <TableCell>{expiryInfo.text}</TableCell>
                      <TableCell>{expiryInfo.badge}</TableCell>
                      <TableCell>
                        {device.status === 'online' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedDeviceId(device.id);
                              setIsCommandDialogOpen(true);
                            }}
                          >
                            Fetch IMSI
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {searchTerm || (statusFilter.length > 0 && !statusFilter.includes('all')) ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <SearchIcon className="h-8 w-8" />
                        <p>No devices found matching your filters.</p>
                      </div>
                    ) : (
                      <p>No devices found.</p>
                    )}
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

      {selectedDeviceId !== null && (
        <SendCommandDialog
          deviceId={selectedDeviceId}
          open={isCommandDialogOpen}
          onOpenChange={(open) => {
            setIsCommandDialogOpen(open);
            if (!open) {
              setSelectedDeviceId(null);
            }
          }}
          onCommandSent={async () => {
            toast({
              title: 'Command Sent',
              description: 'Waiting for device to respond with IMSI.',
            });
            
            // Wait for device response
            try {
              await new Promise(resolve => setTimeout(resolve, 8000));
              
              const events = await getTraccarDeviceEvents(selectedDeviceId);
              const commandResultEvent = events.find(e => e.type === 'commandResult');
              
              if (!commandResultEvent || !commandResultEvent.attributes.result) {
                toast({
                  variant: 'destructive',
                  title: 'No Response',
                  description: 'Device did not respond with IMSI. It might be offline.',
                });
                return;
              }
              
              const resultText = commandResultEvent.attributes.result as string;
              const imsiMatch = resultText.match(/IMSI:(\d+)/);
              
              if (!imsiMatch || !imsiMatch[1]) {
                toast({
                  variant: 'destructive',
                  title: 'IMSI Not Found',
                  description: 'Could not extract IMSI from device response.',
                });
                return;
              }
              
              const fetchedImsiValue = imsiMatch[1];
              setFetchedImsi(fetchedImsiValue);
              
              // Find the device's IMEI and check for saved record
              const device = devices?.find(d => d.id === selectedDeviceId);
              if (!device) return;
              
              const record = imeiToRecordMap.get(device.uniqueId);
              if (record) {
                const savedImsiValue = record.record.imsi;
                setSavedImsi(savedImsiValue);
                setRecordToUpdate(record);
                
                // Compare IMSIs
                if (savedImsiValue && savedImsiValue !== fetchedImsiValue) {
                  setIsImsiComparisonOpen(true);
                } else if (!savedImsiValue) {
                  toast({
                    title: 'IMSI Fetched',
                    description: `Device IMSI: ${fetchedImsiValue}. No saved IMSI found to compare.`,
                  });
                } else {
                  toast({
                    title: 'IMSI Match',
                    description: 'Fetched IMSI matches the saved IMSI.',
                  });
                }
              } else {
                toast({
                  title: 'IMSI Fetched',
                  description: `Device IMSI: ${fetchedImsiValue}. No sale/company vehicle record found.`,
                });
              }
            } catch (error: any) {
              toast({
                variant: 'destructive',
                title: 'Failed to Fetch IMSI',
                description: error.message || 'Could not retrieve IMSI from device.',
              });
            }
          }}
        />
      )}

      <AlertDialog open={isImsiComparisonOpen} onOpenChange={setIsImsiComparisonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>IMSI Mismatch Detected</AlertDialogTitle>
            <AlertDialogDescription>
              The IMSI fetched from the device ({fetchedImsi}) does not match the saved IMSI ({savedImsi}).
              <br /><br />
              Would you like to update the record with the correct IMSI?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Keep Current</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!recordToUpdate || !fetchedImsi || !user) return;
                
                try {
                  const endpoint = recordToUpdate.type === 'sale' ? `/api/sales/${recordToUpdate.record.id}` : `/api/company-vehicles/${recordToUpdate.record.id}`;
                  const response = await fetch(endpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imsi: fetchedImsi }),
                  });

                  if (!response.ok) {
                    throw new Error(await response.text());
                  }
                  
                  await addLog(
                    `Updated IMSI for ${recordToUpdate.type === 'sale' ? 'sale' : 'company vehicle'} ${recordToUpdate.record.vehicleNumber} from ${savedImsi} to ${fetchedImsi}`,
                    user.name,
                    'update'
                  );
                  
                  toast({
                    title: 'IMSI Updated',
                    description: `Successfully updated IMSI to ${fetchedImsi}.`,
                  });
                  
                  setIsImsiComparisonOpen(false);
                  setFetchedImsi(null);
                  setSavedImsi(null);
                  setRecordToUpdate(null);
                } catch (error: any) {
                  toast({
                    variant: 'destructive',
                    title: 'Update Failed',
                    description: error.message || 'Could not update IMSI.',
                  });
                }
              }}
            >
              Yes, Update IMSI
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
    </>
  );
}
