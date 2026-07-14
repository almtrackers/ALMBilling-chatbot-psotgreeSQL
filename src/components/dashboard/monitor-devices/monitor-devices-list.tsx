
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useDevices } from '@/hooks/use-devices';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { useDeviceRemarks } from '@/hooks/use-device-remarks';
import { useSales } from '@/hooks/use-sales';
import { useWebSocket } from '@/contexts/websocket-context';
import type { Device, DeviceRemark } from '@/lib/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  MessageSquare,
  AlertCircle,
  Download,
  Search,
  MapPin,
  Smartphone,
  X,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
  subYears,
} from 'date-fns';
import type { DateRange } from 'react-day-picker';
import DeviceDetailsDialog from './device-details-dialog';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  buildImeiToSaleMap,
  buildMonitorDeviceDetails,
  buildMonitorDevicesExportCsv,
  getMonitorStatusBadgeVariant,
  getMonitorStatusLabel,
  isMonitorCandidate,
  matchesMonitorDateRange,
  matchesMonitorStatusFilter,
  type MonitorDateField,
  type MonitorDisplayStatus,
  type MonitorStatusFilter,
} from '@/lib/monitor-devices';

const RECORDS_PER_PAGE = 25;

type DeviceWithDetails = Device & {
  customerName: string;
  phoneRobocall?: string | null;
  simNumber?: string | null;
  coordinates?: { latitude: number; longitude: number; mapLink: string } | null;
  displayStatus: MonitorDisplayStatus;
  expiryLabel: string;
  lastRemark?: DeviceRemark;
  offlineDays: number;
  hasRemarks: boolean;
};

export default function MonitorDevicesList() {
  const { toast } = useToast();
  const { devices, isLoading: isLoadingDevices } = useDevices();
  const { users, isLoading: isLoadingUsers } = useTraccarUsers();
  const { remarks, isLoading: isLoadingRemarks } = useDeviceRemarks();
  const { sales, isLoading: isLoadingSales } = useSales();
  const { positions } = useWebSocket();
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<MonitorStatusFilter>('all');
  const [dateField, setDateField] = useState<MonitorDateField>('lastUpdate');
  const [datePreset, setDatePreset] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const salesByImei = useMemo(() => buildImeiToSaleMap(sales), [sales]);

  const positionsByDeviceId = useMemo(() => {
    const map = new Map<number, { latitude: number; longitude: number }>();
    Object.values(positions).forEach((pos) => {
      if (pos.deviceId && pos.latitude && pos.longitude) {
        map.set(pos.deviceId, { latitude: pos.latitude, longitude: pos.longitude });
      }
      if (pos.id) {
        map.set(pos.id, { latitude: pos.latitude, longitude: pos.longitude });
      }
    });
    return map;
  }, [positions]);

  const monitoredDevices = useMemo(() => {
    if (!devices || !users || !remarks) return [];

    const userMap = new Map(users.map((u) => [u.id, u.name]));
    const remarksMap = new Map<number, DeviceRemark>();

    remarks.forEach((remark) => {
      const existing = remarksMap.get(remark.deviceId);
      const remarkDate = new Date(remark.createdAt).getTime();
      const existingDate = existing ? new Date(existing.createdAt).getTime() : 0;
      if (!existing || remarkDate > existingDate) {
        remarksMap.set(remark.deviceId, remark);
      }
    });

    const devicesWithDetails: DeviceWithDetails[] = devices
      .filter((device) => isMonitorCandidate(device))
      .map((device) => {
        const ownerId = device.attributes?.uId;
        const userName =
          typeof ownerId === 'number' && userMap.has(ownerId)
            ? userMap.get(ownerId)
            : undefined;
        const details = buildMonitorDeviceDetails(device, {
          salesByImei,
          positionsByDeviceId,
          customerName: userName,
        });
        const lastRemark = remarksMap.get(device.id);

        return {
          ...device,
          customerName: details.customerName,
          phoneRobocall: details.phoneRobocall,
          simNumber: details.simNumber,
          coordinates: details.coordinates,
          displayStatus: details.displayStatus,
          expiryLabel: details.expiryLabel,
          lastRemark,
          offlineDays: details.offlineDays,
          hasRemarks: !!lastRemark,
        };
      })
      .filter((device) => matchesMonitorStatusFilter(device.displayStatus, statusFilter))
      .filter((device) =>
        matchesMonitorDateRange(device, dateField, dateRange?.from, dateRange?.to)
      )
      .sort((a, b) => {
        if (a.hasRemarks !== b.hasRemarks) {
          return a.hasRemarks ? 1 : -1;
        }
        return b.offlineDays - a.offlineDays;
      });

    if (!searchTerm) return devicesWithDetails;

    const term = searchTerm.toLowerCase();
    return devicesWithDetails.filter(
      (d) =>
        d.name.toLowerCase().includes(term) ||
        d.customerName?.toLowerCase().includes(term) ||
        d.phoneRobocall?.includes(term) ||
        d.simNumber?.includes(term) ||
        d.uniqueId?.includes(term)
    );
  }, [devices, users, remarks, salesByImei, positionsByDeviceId, statusFilter, dateField, dateRange, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateField, dateRange]);

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    switch (preset) {
      case 'current_month':
        setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case 'last_month': {
        const lastMonth = subMonths(now, 1);
        setDateRange({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
        break;
      }
      case 'current_year':
        setDateRange({ from: startOfYear(now), to: endOfYear(now) });
        break;
      case 'last_year': {
        const lastYear = subYears(now, 1);
        setDateRange({ from: startOfYear(lastYear), to: endOfYear(lastYear) });
        break;
      }
      case 'all':
      default:
        setDateRange(undefined);
        break;
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateField('lastUpdate');
    setDatePreset('all');
    setDateRange(undefined);
  };

  const totalPages = Math.max(1, Math.ceil(monitoredDevices.length / RECORDS_PER_PAGE));

  const paginatedDevices = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return monitoredDevices.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [monitoredDevices, currentPage]);

  const pageStart = monitoredDevices.length === 0 ? 0 : (currentPage - 1) * RECORDS_PER_PAGE + 1;
  const pageEnd = Math.min(currentPage * RECORDS_PER_PAGE, monitoredDevices.length);

  const handleExport = async () => {
    if (monitoredDevices.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Data to Export',
        description: 'No devices match the current monitor filters.',
      });
      return;
    }

    setIsExporting(true);
    try {
      let exportPositions = new Map(positionsByDeviceId);
      try {
        const response = await apiClient.get<Array<{ deviceId: number; latitude: number; longitude: number; id?: number }>>('/positions');
        response.data?.forEach((pos) => {
          if (pos.deviceId && pos.latitude && pos.longitude) {
            exportPositions.set(pos.deviceId, { latitude: pos.latitude, longitude: pos.longitude });
          }
          if (pos.id) {
            exportPositions.set(pos.id, { latitude: pos.latitude, longitude: pos.longitude });
          }
        });
      } catch {
        // Fall back to websocket positions already loaded
      }

      const rows = monitoredDevices.map((device) => {
        const details = buildMonitorDeviceDetails(device, {
          salesByImei,
          positionsByDeviceId: exportPositions,
          customerName: device.customerName,
        });

        return {
          deviceName: device.name,
          customerName: device.customerName,
          phone: details.phoneRobocall || '',
          simNumber: details.simNumber || '',
          latitude: details.coordinates ? String(details.coordinates.latitude) : '',
          longitude: details.coordinates ? String(details.coordinates.longitude) : '',
          mapLink: details.coordinates?.mapLink || '',
          status: getMonitorStatusLabel(details.displayStatus),
          expiryDate: details.expiryLabel,
          offlineDays: details.offlineDays < 999 ? String(details.offlineDays) : 'Unknown',
          imei: device.uniqueId,
        };
      });

      const csv = buildMonitorDevicesExportCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `monitor-devices-${statusFilter}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Complete',
        description: `Exported all ${rows.length} filtered device(s) with SIM numbers and coordinates.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: error.message || 'Could not export monitor device data.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const isLoading = isLoadingDevices || isLoadingUsers || isLoadingRemarks || isLoadingSales;
  const hasActiveFilters = !!searchTerm || statusFilter !== 'all' || !!dateRange;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monitor Devices</CardTitle>
          <CardDescription>Loading device monitoring data...</CardDescription>
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Offline, Unknown & Expired Devices</CardTitle>
              <CardDescription>
                {monitoredDevices.length} device(s) match the current filters
                {monitoredDevices.length > 0 && (
                  <> — showing {pageStart}-{pageEnd} on this page ({RECORDS_PER_PAGE} per page)</>
                )}
                . Export includes all filtered devices.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={isExporting || monitoredDevices.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export SIM + Coordinates'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Search</label>
              <Search className="absolute left-2.5 top-9 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by device, customer, phone, SIM, or IMEI..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MonitorStatusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Monitor Devices</SelectItem>
                  <SelectItem value="unknown">Unknown Only</SelectItem>
                  <SelectItem value="offline">Offline Only</SelectItem>
                  <SelectItem value="expired">Expired Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Date Field</label>
              <Select value={dateField} onValueChange={(value) => setDateField(value as MonitorDateField)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by date..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lastUpdate">Last Update / Offline Since</SelectItem>
                  <SelectItem value="expiry">Expiry Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Date Period</label>
              <Select value={datePreset} onValueChange={handleDatePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="current_month">Current Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="current_year">Current Year</SelectItem>
                  <SelectItem value="last_year">Last Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <label className="mb-1.5 block text-sm font-medium">Custom Date Range</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dateRange && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}
                        </>
                      ) : (
                        format(dateRange.from, 'LLL dd, y')
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={(range) => {
                      setDateRange(range);
                      setDatePreset(range?.from ? 'custom' : 'all');
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              <X className="mr-2 h-4 w-4" />
              Clear Filters
            </Button>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>SIM Number</TableHead>
                <TableHead>Coordinates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Offline Since</TableHead>
                <TableHead>Last Call</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDevices.length > 0 ? (
                paginatedDevices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">{device.name}</TableCell>
                    <TableCell>{device.customerName}</TableCell>
                    <TableCell>
                      {device.phoneRobocall ? (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{device.phoneRobocall}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {device.simNumber ? (
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{device.simNumber}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {device.coordinates ? (
                        <a
                          href={device.coordinates.mapLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <MapPin className="h-4 w-4" />
                          <span className="font-mono">
                            {device.coordinates.latitude.toFixed(5)}, {device.coordinates.longitude.toFixed(5)}
                          </span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getMonitorStatusBadgeVariant(device.displayStatus)}
                        className={device.displayStatus === 'expired' ? 'bg-orange-600 hover:bg-orange-700' : ''}
                      >
                        {getMonitorStatusLabel(device.displayStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{device.expiryLabel}</span>
                    </TableCell>
                    <TableCell>
                      {device.offlineDays < 999 ? (
                        <span>{device.offlineDays} day(s)</span>
                      ) : (
                        <span className="text-muted-foreground">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {device.lastRemark?.lastCallDate ? (
                        <span className="text-sm">
                          {format(new Date(device.lastRemark.lastCallDate), 'PP')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {device.hasRemarks ? (
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-green-600" />
                          <span className="max-w-[180px] truncate text-sm text-muted-foreground">
                            {device.lastRemark?.remarks}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="border-orange-600 text-orange-600">
                          No Remarks
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedDevice(device);
                          setIsDetailsDialogOpen(true);
                        }}
                      >
                        <Phone className="mr-2 h-4 w-4" />
                        Monitor
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <AlertCircle className="h-8 w-8" />
                      {hasActiveFilters ? (
                        <>
                          <p>No devices match the current filters.</p>
                          <p className="text-xs">Try changing the status filter or search term.</p>
                        </>
                      ) : (
                        <p>No offline, unknown, or expired devices found.</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {monitoredDevices.length > RECORDS_PER_PAGE && (
            <div className="flex items-center justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
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
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedDevice && (
        <DeviceDetailsDialog
          open={isDetailsDialogOpen}
          onOpenChange={setIsDetailsDialogOpen}
          device={selectedDevice}
          customerName={
            monitoredDevices.find((d) => d.id === selectedDevice.id)?.customerName || 'Unknown Customer'
          }
          phoneRobocall={monitoredDevices.find((d) => d.id === selectedDevice.id)?.phoneRobocall || undefined}
          simNumber={monitoredDevices.find((d) => d.id === selectedDevice.id)?.simNumber || undefined}
          coordinates={monitoredDevices.find((d) => d.id === selectedDevice.id)?.coordinates || undefined}
          displayStatus={monitoredDevices.find((d) => d.id === selectedDevice.id)?.displayStatus}
          expiryLabel={monitoredDevices.find((d) => d.id === selectedDevice.id)?.expiryLabel}
          lastRemark={monitoredDevices.find((d) => d.id === selectedDevice.id)?.lastRemark}
        />
      )}
    </>
  );
}
