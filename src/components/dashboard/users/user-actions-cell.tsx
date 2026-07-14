
'use client';

import { useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import type { TraccarUser } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Loader2, MoreHorizontal, Trash2, Link, UserX, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { addLog } from '@/lib/log-service';
import { useTraccarUsers } from '@/hooks/use-traccar-users';
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
import AssignDevicesDialog from './assign-devices-dialog';

type UserActionsCellProps = {
  userId: number;
  userName: string;
};

export default function UserActionsCell({ userId, userName }: UserActionsCellProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { users: traccarUsers, mutate: mutateUsers } = useTraccarUsers();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [actionToConfirm, setActionToConfirm] = useState<'disable' | 'enable' | 'delete' | null>(null);

  const currentUser = useMemo(() => traccarUsers?.find(u => u.id === userId), [traccarUsers, userId]);

  const handleConfirmAction = () => {
    if (actionToConfirm === 'delete') {
      handleDeleteUser();
    } else if (actionToConfirm === 'disable' || actionToConfirm === 'enable') {
      handleToggleUserStatus();
    }
  };
  
  const handleToggleUserStatus = async () => {
    if (!currentUser || !user) return;
    setIsUpdatingStatus(true);
    const newStatus = !currentUser.disabled;

    try {
      await apiClient.put(`/users/${userId}`, { ...currentUser, disabled: newStatus });
      const action = newStatus ? 'disabled' : 'enabled';
      toast({
        title: `User ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        description: `User ${userName} has been successfully ${action}.`,
      });
      await addLog(`User ${userName} was ${action}`, user.name, 'update');
      mutateUsers();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || `Could not update user ${userName}.`,
      });
    } finally {
      setIsUpdatingStatus(false);
      setIsAlertOpen(false);
    }
  };


  const handleDeleteUser = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
        await apiClient.delete(`/users/${userId}`);
        toast({
            title: "User Deleted",
            description: `User ${userName} has been successfully deleted.`,
        });
        await addLog(`Deleted user: ${userName} (ID: ${userId})`, user.name, 'delete');
        mutateUsers();
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Deletion Failed",
            description: error.message || "Could not delete the user from the server.",
        });
    } finally {
        setIsDeleting(false);
        setIsAlertOpen(false);
    }
  };

  const getConfirmationDialogContent = () => {
    switch (actionToConfirm) {
        case 'disable':
            return { title: 'Disable User?', description: `This will prevent ${userName} from logging in. Are you sure?` };
        case 'enable':
            return { title: 'Enable User?', description: `This will allow ${userName} to log in again. Are you sure?` };
        case 'delete':
            return { title: 'Are you absolutely sure?', description: `This action cannot be undone. This will permanently delete ${userName} and unassign all their devices.` };
        default:
            return { title: '', description: '' };
    }
  };

  const { title, description } = getConfirmationDialogContent();

  return (
     <>
        <div className="flex items-center gap-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setIsAssignDialogOpen(true)}>
                        <Link className="mr-2 h-4 w-4" />
                        Assign Devices
                    </DropdownMenuItem>
                    {currentUser?.disabled ? (
                         <DropdownMenuItem onClick={() => { setActionToConfirm('enable'); setIsAlertOpen(true); }} disabled={isUpdatingStatus}>
                            <UserCheck className="mr-2 h-4 w-4" />
                            Enable User
                         </DropdownMenuItem>
                    ) : (
                         <DropdownMenuItem onClick={() => { setActionToConfirm('disable'); setIsAlertOpen(true); }} disabled={isUpdatingStatus}>
                            <UserX className="mr-2 h-4 w-4" />
                            Disable User
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                        onClick={() => { setActionToConfirm('delete'); setIsAlertOpen(true); }}
                        disabled={isDeleting}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete User
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
        <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                       {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                     className={actionToConfirm === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}
                     onClick={handleConfirmAction}
                    >
                        Yes, proceed
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
      </AlertDialog>
      <AssignDevicesDialog 
        open={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
        userId={userId}
        userName={userName}
      />
    </>
  );
}
