'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api';
import type { Notification } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ServerCrash, MoreHorizontal, BellOff, Trash2, Edit } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import AddNotificationForm from './add-notification-form';

const RECORDS_PER_PAGE = 15;

const fetcher = (url: string) => apiClient.get<Notification[]>(url).then((res) => res.data);

export default function NotificationList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: notifications, isLoading, error, mutate } = useSWR<Notification[]>(user ? '/notifications' : null, fetcher);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const paginatedNotifications = useMemo(() => {
    if (!notifications) return [];
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return notifications.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [notifications, currentPage]);

  const totalPages = Math.ceil((notifications?.length || 0) / RECORDS_PER_PAGE);

  const openDeleteDialog = (notification: Notification) => {
    setSelectedNotification(notification);
    setIsAlertOpen(true);
  };
  
  const openEditDialog = (notification: Notification) => {
    setSelectedNotification(notification);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedNotification || !user) return;
    try {
      await apiClient.delete(`/notifications/${selectedNotification.id}`);
      await addLog(`Deleted notification: ${selectedNotification.type}`, user.name, 'delete');
      toast({
        title: 'Notification Deleted',
        description: `The notification has been successfully deleted.`,
      });
      mutate(); // Re-fetch the list
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Deletion Failed',
        description: err.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsAlertOpen(false);
      setSelectedNotification(null);
    }
  };
  
  const formatNotificators = (notificators: string) => {
    return notificators.split(',').map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(', ');
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-2/3 mt-2" /></CardHeader>
        <CardContent>
          <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" /><AlertTitle>Failed to load notifications</AlertTitle>
            <AlertDescription>There was a problem fetching data from the server.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Saved Notifications</CardTitle><CardDescription>A list of all your configured notifications.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Event Type</TableHead><TableHead>Channels</TableHead><TableHead>Alarm Types</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {paginatedNotifications && paginatedNotifications.length > 0 ? (
                paginatedNotifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell className="font-medium">{notification.type}</TableCell>
                    <TableCell><Badge variant="outline">{formatNotificators(notification.notificators)}</Badge></TableCell>
                    <TableCell>
                      {notification.attributes.alarms ? (
                        <div className="flex flex-wrap gap-1">
                          {notification.attributes.alarms.split(',').map((alarm: string) => (
                            <Badge key={alarm} variant="secondary">{alarm}</Badge>
                          ))}
                        </div>
                      ) : (
                        <Badge variant="outline">All Events</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button aria-haspopup="true" size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Toggle menu</span></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openEditDialog(notification)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => openDeleteDialog(notification)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground"><BellOff className="h-8 w-8" /><p>No notifications found.</p><p className="text-xs">Use the "Add Notification" button to create one.</p></div>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end space-x-2 py-4">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages > 0 ? totalPages : 1}</span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0}>Next</Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete this notification.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Yes, delete it</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Notification</DialogTitle><DialogDescription>Update the details for this notification.</DialogDescription></DialogHeader>
          <AddNotificationForm setDialogOpen={setIsEditDialogOpen} notificationToEdit={selectedNotification} onNotificationAdded={mutate} />
        </DialogContent>
      </Dialog>
    </>
  );
}
