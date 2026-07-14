
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Phone, Calendar, Clock, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
import { useDeviceRemarks } from '@/hooks/use-device-remarks';
import { getRobocallLogs, getTraccarDeviceEvents } from '@/lib/api';
import type { Device, DeviceRemark, TraccarUser } from '@/lib/types';
import { addLog } from '@/lib/log-service';
import { format, isValid, parseISO } from 'date-fns';
import { getMonitorStatusBadgeVariant, getMonitorStatusLabel, type MonitorDisplayStatus } from '@/lib/monitor-devices';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const formSchema = z.object({
  moderatorName: z.string().min(1, 'Moderator is required.'),
  remarks: z.string().min(1, 'Remarks are required.'),
  maintenanceRequired: z.boolean().default(false),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
}).refine(data => {
  if (data.maintenanceRequired) {
    return data.scheduledDate && data.scheduledTime;
  }
  return true;
}, {
  message: "Scheduled date and time are required when maintenance is needed.",
  path: ['scheduledDate'],
});

type DeviceDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: Device;
  customerName: string;
  phoneRobocall?: string;
  simNumber?: string;
  coordinates?: { latitude: number; longitude: number; mapLink: string };
  displayStatus?: MonitorDisplayStatus;
  expiryLabel?: string;
  lastRemark?: DeviceRemark;
};

export default function DeviceDetailsDialog({
  open,
  onOpenChange,
  device,
  customerName,
  phoneRobocall,
  simNumber,
  coordinates,
  displayStatus,
  expiryLabel,
  lastRemark,
}: DeviceDetailsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { users } = useTraccarUsers();
  const { mutate } = useDeviceRemarks();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [robocallLogs, setRobocallLogs] = useState<any[]>([]);
  const [deviceEvents, setDeviceEvents] = useState<any[]>([]);
  const [logsFetched, setLogsFetched] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      moderatorName: user?.name || '',
      remarks: '',
      maintenanceRequired: false,
      scheduledDate: '',
      scheduledTime: '',
    },
  });

  const maintenanceRequired = form.watch('maintenanceRequired');

  // Get moderators (admins and managers)
  const moderators = users?.filter(u => u.administrator || u.manager) || [];

  const handleFetchLogs = async () => {
    if (!device) return;
    
    setIsFetchingLogs(true);
    try {
      // Fetch last 5 robocall logs for this specific device
      const logs = await getRobocallLogs({
        deviceId: device.id,
        limit: 5,
      });
      setRobocallLogs(logs);

      // Fetch device events from last 7 days for this specific device
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      const events = await getTraccarDeviceEvents(device.id, fromDate);
      // Filter to show only events with "status" or "alarm" in the type name
      const filteredEvents = events.filter(event => {
        const eventType = event.type?.toLowerCase() || '';
        // Check if event type contains "status" or "alarm"
        return eventType.includes('status') || eventType.includes('alarm');
      });
      setDeviceEvents(filteredEvents.slice(0, 5)); // Last 5 filtered events

      setLogsFetched(true);
      toast({
        title: 'Logs Fetched',
        description: `Retrieved ${logs.length} robocall logs and ${filteredEvents.length} device events for this device.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to Fetch Logs',
        description: error.message || 'Could not fetch logs from server.',
      });
    } finally {
      setIsFetchingLogs(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to save remarks.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const remarkData: any = {
        deviceId: device.id,
        deviceName: device.name,
        customerName,
        phoneRobocall,
        moderatorName: values.moderatorName,
        remarks: values.remarks,
        lastCallDate: new Date(),
        maintenanceRequired: values.maintenanceRequired,
      };

      if (values.maintenanceRequired && values.scheduledDate && values.scheduledTime) {
        const scheduledDateTime = new Date(`${values.scheduledDate}T${values.scheduledTime}`);
        remarkData.scheduledDate = scheduledDateTime;
        remarkData.scheduledTime = values.scheduledTime;
      }

      const response = await fetch('/api/traccar/devices/remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remarkData),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await addLog(
        `Added monitoring remarks for device ${device.name} (${customerName})`,
        user.name,
        'update'
      );

      toast({
        title: 'Remarks Saved',
        description: 'Device monitoring remarks have been saved successfully.',
      });

      mutate(); // Refresh the list
      form.reset();
      setRobocallLogs([]);
      setDeviceEvents([]);
      setLogsFetched(false);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to Save',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Monitor Device: {device.name}</DialogTitle>
          <DialogDescription>
            Customer: {customerName}
            {phoneRobocall && ` | Phone: ${phoneRobocall}`}
            {simNumber && ` | SIM: ${simNumber}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Device Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Device Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold">Status:</span>{' '}
                  <Badge
                    variant={getMonitorStatusBadgeVariant(displayStatus || 'unknown')}
                    className={displayStatus === 'expired' ? 'bg-orange-600 hover:bg-orange-700' : ''}
                  >
                    {displayStatus ? getMonitorStatusLabel(displayStatus) : device.status}
                  </Badge>
                </div>
                <div>
                  <span className="font-semibold">IMEI:</span> {device.uniqueId}
                </div>
                <div>
                  <span className="font-semibold">Expiry:</span> {expiryLabel || 'N/A'}
                </div>
                {phoneRobocall && (
                  <div>
                    <span className="font-semibold">Phone:</span>{' '}
                    <span className="font-mono">{phoneRobocall}</span>
                  </div>
                )}
                {simNumber && (
                  <div>
                    <span className="font-semibold">SIM Number:</span>{' '}
                    <span className="font-mono">{simNumber}</span>
                  </div>
                )}
                {coordinates && (
                  <div className="col-span-2">
                    <span className="font-semibold">Last Location:</span>{' '}
                    <a
                      href={coordinates.mapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <MapPin className="h-4 w-4" />
                      <span className="font-mono">
                        {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}
                      </span>
                    </a>
                  </div>
                )}
                {(device.status === 'offline' || device.status === 'unknown') && device.lastUpdate && (
                  <div>
                    <span className="font-semibold">Last Report:</span>{' '}
                    <span className="text-muted-foreground">
                      {(() => {
                        try {
                          const lastUpdateDate = typeof device.lastUpdate === 'string' 
                            ? parseISO(device.lastUpdate) 
                            : new Date(device.lastUpdate);
                          if (isValid(lastUpdateDate)) {
                            return format(lastUpdateDate, 'PPp');
                          }
                        } catch (e) {
                          // Invalid date
                        }
                        return 'N/A';
                      })()}
                    </span>
                  </div>
                )}
                {lastRemark && (
                  <div>
                    <span className="font-semibold">Last Call:</span>{' '}
                    {format(lastRemark.lastCallDate ? new Date(lastRemark.lastCallDate) : new Date(), 'PP')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fetch Logs Button */}
          <div className="flex justify-between items-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleFetchLogs}
              disabled={isFetchingLogs}
            >
              {isFetchingLogs ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <Phone className="mr-2 h-4 w-4" />
                  Fetch Robocall Logs & Events
                </>
              )}
            </Button>
            {logsFetched && (
              <Badge variant="outline" className="text-green-600">
                Logs Loaded
              </Badge>
            )}
          </div>

          {/* Robocall Logs */}
          {robocallLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Last 5 Robocall Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {robocallLogs.map((log, index) => {
                    let logDate: Date | null = null;
                    let formattedLogDate = 'N/A';
                    
                    if (log.createdAt) {
                      try {
                        const parsed = typeof log.createdAt === 'string' 
                          ? parseISO(log.createdAt) 
                          : new Date(log.createdAt);
                        if (isValid(parsed)) {
                          logDate = parsed;
                          formattedLogDate = format(parsed, 'PPp');
                        }
                      } catch (e) {
                        // Invalid date, use fallback
                      }
                    }
                    
                    return (
                      <div key={index} className="p-3 border rounded-lg text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="font-semibold">Status:</span>{' '}
                            <Badge variant={log.callStatus === 'completed' ? 'default' : 'destructive'}>
                              {log.callStatus || 'Unknown'}
                            </Badge>
                          </div>
                          <div>
                            <span className="font-semibold">Date:</span>{' '}
                            {formattedLogDate}
                          </div>
                          <div>
                            <span className="font-semibold">Call To:</span>{' '}
                            <span className="font-mono">{log.callTo || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="font-semibold">Voice ID:</span>{' '}
                            {(() => {
                              const voiceId = log.voiceId;
                              if (!voiceId) return 'N/A';
                              
                              const voiceIdMap: Record<number | string, string> = {
                                1: 'Power Cut',
                                2: 'Engine Attempt',
                                3: 'Expiry Alert',
                                4: 'Expiry Alert',
                                5: 'Geofence Exited',
                                6: 'Low Battery',
                                7: 'No GPS',
                                8: 'No Presence',
                                9: 'Offline Alert',
                                10: 'Tow Alert',
                                11: 'Vibration Alert',
                                12: 'ACC after Mid',
                              };
                              
                              const voiceIdNum = typeof voiceId === 'string' ? parseInt(voiceId, 10) : voiceId;
                              const description = voiceIdMap[voiceIdNum] || '';
                              
                              return description ? `${voiceId}(${description})` : voiceId;
                            })()}
                          </div>
                          {log.duration && (
                            <div>
                              <span className="font-semibold">Duration:</span> {log.duration}s
                            </div>
                          )}
                          {log.errorMessage && (
                            <div className="col-span-2 text-red-600">
                              <span className="font-semibold">Error:</span> {log.errorMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Device Events */}
          {deviceEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Device Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">

                  {deviceEvents.map((event, index) => {
                    let formattedDate = 'N/A';
                    
                    if (event.serverTime) {
                      try {
                        let parsed: Date;
                        
                        // Handle different date formats
                        if (typeof event.serverTime === 'string') {
                          // Try parseISO first for ISO strings
                          parsed = parseISO(event.serverTime);
                          // If parseISO fails, try new Date
                          if (!isValid(parsed)) {
                            parsed = new Date(event.serverTime);
                          }
                        } else if (event.serverTime instanceof Date) {
                          parsed = event.serverTime;
                        } else if (typeof event.serverTime === 'number') {
                          // Timestamp
                          parsed = new Date(event.serverTime);
                        } else {
                          parsed = new Date(String(event.serverTime));
                        }
                        
                        // Validate the parsed date
                        if (isValid(parsed)) {
                          formattedDate = format(parsed, 'PPp');
                        } else {
                          formattedDate = 'Invalid Date';
                        }
                      } catch (e) {
                        // If all parsing fails, show N/A
                        formattedDate = 'N/A';
                      }
                    }
                    
                    return (
                      <div key={index} className="p-2 border rounded text-xs">
                        <div className="flex justify-between">
                          <span className="font-semibold">{event.type || 'Unknown Event'}</span>
                          <span className="text-muted-foreground">
                            {formattedDate}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Remarks Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="moderatorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moderator</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select moderator..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {moderators.map((mod) => (
                          <SelectItem key={mod.id} value={mod.name}>
                            {mod.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="remarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Remarks</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter customer remarks about device behavior..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Record customer feedback about device behavior after calling.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maintenanceRequired"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Maintenance Required</FormLabel>
                      <FormDescription>
                        Check if device requires maintenance or repair.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {maintenanceRequired && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduledDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Calendar className="inline mr-2 h-4 w-4" />
                          Scheduled Date
                        </FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduledTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <Clock className="inline mr-2 h-4 w-4" />
                          Scheduled Time
                        </FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Remarks'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
