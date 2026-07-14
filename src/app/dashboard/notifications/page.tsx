
'use client';

import { useState } from 'react';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import AddNotificationForm from '@/components/dashboard/notifications/add-notification-form';
import NotificationList from '@/components/dashboard/notifications/notification-list';

export default function NotificationsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Manage reusable alarm and event notifications."
      >
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Notification
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Notification</DialogTitle>
              <DialogDescription>
                Configure a new notification that can be linked to devices.
              </DialogDescription>
            </DialogHeader>
            <AddNotificationForm setDialogOpen={setIsAddDialogOpen} />
          </DialogContent>
        </Dialog>
      </PageHeader>
      <NotificationList />
    </div>
  );
}
