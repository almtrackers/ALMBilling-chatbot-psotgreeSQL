
'use client';

import { useState, useMemo } from 'react';
import axios from 'axios';
import { useCommands } from '@/hooks/use-commands';
import type { CustomCommand, Device } from '@/lib/types';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ServerCrash, MoreHorizontal, Terminal, Trash2, Edit, Send } from 'lucide-react';
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
import AddCommandForm from './add-command-form';
import SendCustomCommandDialog from './send-custom-command-dialog';

const RECORDS_PER_PAGE = 15;

export default function CommandList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { commands, isLoading, isError: error, mutate } = useCommands();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<CustomCommand | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const paginatedCommands = useMemo(() => {
    if (!commands) return [];
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return commands.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [commands, currentPage]);

  const totalPages = Math.ceil((commands?.length || 0) / RECORDS_PER_PAGE);

  const openDeleteDialog = (command: CustomCommand) => {
    setSelectedCommand(command);
    setIsAlertOpen(true);
  };
  
  const openEditDialog = (command: CustomCommand) => {
    setSelectedCommand(command);
    setIsEditDialogOpen(true);
  };

  const openSendDialog = (command: CustomCommand) => {
    setSelectedCommand(command);
    setIsSendDialogOpen(true);
  };

  const handleDelete = async () => {
    if (selectedCommand && user) {
      try {
        await axios.delete(`/api/commands?id=${selectedCommand.id}`);
        await addLog(`Deleted custom command: "${selectedCommand.name}"`, user.name, 'delete');
        toast({
          title: 'Command Deleted',
          description: `The command "${selectedCommand.name}" has been removed.`,
        });
        mutate();
        setSelectedCommand(null);
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: err.response?.data?.message || 'Failed to delete command',
        });
      }
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
          <CardTitle>Saved Commands</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load commands</AlertTitle>
            <AlertDescription>
              There was a problem fetching your saved commands.
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
          <CardTitle>Saved Commands</CardTitle>
          <CardDescription>A list of all your reusable commands.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Command String</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCommands && paginatedCommands.length > 0 ? (
                paginatedCommands.map((command) => (
                  <TableRow key={command.id}>
                    <TableCell className="font-medium">{command.name}</TableCell>
                    <TableCell><code>{command.command}</code></TableCell>
                    <TableCell className="text-right">
                       <Button size="sm" onClick={() => openSendDialog(command)}>
                        <Send className="mr-2 h-4 w-4" />
                        Send
                       </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openEditDialog(command)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            onClick={() => openDeleteDialog(command)}
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
                      <Terminal className="h-8 w-8" />
                      <p>No commands saved yet.</p>
                      <p className="text-xs">Use the form to add your first command.</p>
                    </div>
                  </TableCell>
                </TableRow>
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
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this custom command.
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Command</DialogTitle>
            <DialogDescription>
                Update the details for this command.
            </DialogDescription>
          </DialogHeader>
          <AddCommandForm commandToEdit={selectedCommand!} onFinished={() => setIsEditDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      <SendCustomCommandDialog
        open={isSendDialogOpen}
        onOpenChange={setIsSendDialogOpen}
        command={selectedCommand}
      />
    </>
  );
}
