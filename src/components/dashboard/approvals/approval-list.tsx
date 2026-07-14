
'use client';

import { useState, useMemo } from 'react';
import axios from 'axios';
import { useApprovals } from '@/hooks/use-approvals';
import { useUserPin } from '@/hooks/use-user-pin';
import type { ApprovalRequest, Expense, Invoice } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, formatDistanceToNow, subDays, parseISO } from 'date-fns';
import { ServerCrash, ShieldCheck, Check, X, Info } from 'lucide-react';
import { addLog } from '@/lib/log-service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { reverseTraccarDeviceExpiry } from '@/lib/invoice-service';
import PinDialog from '@/components/auth/pin-dialog';

const RECORDS_PER_PAGE = 15;

export default function ApprovalList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { approvals: requests, isLoading, isError: error, mutate } = useApprovals();
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [currentPendingPage, setCurrentPendingPage] = useState(1);
  const [currentResolvedPage, setCurrentResolvedPage] = useState(1);

  const { pinStatus: userPin } = useUserPin(user?.traccarId);

  const [pendingRequests, resolvedRequests] = useMemo(() => {
    if (!requests) return [[], []];
    const pending = [];
    const resolved = [];
    for (const r of requests) {
      if (r.status === 'pending') {
        pending.push(r);
      } else {
        resolved.push(r);
      }
    }
    return [pending, resolved];
  }, [requests]);

  const paginatedPending = useMemo(() => {
    const startIndex = (currentPendingPage - 1) * RECORDS_PER_PAGE;
    return pendingRequests.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [pendingRequests, currentPendingPage]);

  const paginatedResolved = useMemo(() => {
    const startIndex = (currentResolvedPage - 1) * RECORDS_PER_PAGE;
    return resolvedRequests.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [resolvedRequests, currentResolvedPage]);

  const totalPendingPages = Math.ceil(pendingRequests.length / RECORDS_PER_PAGE);
  const totalResolvedPages = Math.ceil(resolvedRequests.length / RECORDS_PER_PAGE);

  const hasAlreadyVoted = (request: ApprovalRequest) => {
    if (!user || !user.email) return true;
    return request.approvals.some(a => a.uid === user.email) || request.rejections?.some(r => r.uid === user.email);
  };

  const handleApproveClick = (request: ApprovalRequest) => {
    if (userPin?.hasPin) {
        setSelectedRequest(request);
        setIsPinDialogOpen(true);
    } else {
        // If no PIN is set, proceed directly
        handleApprove(request);
    }
  };
  
  const handleApprove = async (request: ApprovalRequest | null) => {
    if (!request || !user || !user.email) return;

    try {
        const response = await axios.put('/api/approvals', {
            id: request.id,
            vote: 'approve',
            uid: user.email,
            name: user.name || user.email,
        });

        if (response.data.success) {
            toast({ title: "Approved!", description: "Your approval has been recorded." });
            if (response.data.status === 'approved') {
                toast({ title: "Action Executed", description: "The final approval was received and the action has been executed." });
            }
            mutate();
        }
    } catch (e: any) {
        toast({ variant: "destructive", title: "Approval Failed", description: e.response?.data?.error || e.message });
    }
  };

  const handleReject = async (request: ApprovalRequest | null) => {
    if (!request || !user || !user.email) return;

    try {
        const response = await axios.put('/api/approvals', {
            id: request.id,
            vote: 'reject',
            uid: user.email,
            name: user.name || user.email,
        });

        if (response.data.success) {
            toast({ title: "Rejected", description: "The request has been rejected." });
            mutate();
        }
    } catch (e: any) {
        toast({ variant: "destructive", title: "Rejection Failed", description: e.response?.data?.error || e.message });
    }
  };

  const getActionDescription = (request: ApprovalRequest) => {
      switch (request.actionType) {
          case 'approve_expense':
              return `Change status of expense "${request.targetId}" to "${request.payload.newStatus}"`;
          case 'mark_invoice_unpaid':
              return `Mark invoice #${request.targetId} as Unpaid and revert device expiry.`;
          case 'clear_logs':
              return `Clear all activity logs older than ${request.payload.days} days.`;
      }
  }

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <ServerCrash className="h-4 w-4" />
        <AlertTitle>Failed to Load Requests</AlertTitle>
        <AlertDescription>There was a problem fetching approval requests.</AlertDescription>
      </Alert>
    );
  }

  return (
      <>
        <Tabs defaultValue="pending" onValueChange={() => {setCurrentPendingPage(1); setCurrentResolvedPage(1)}}>
            <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Requests</CardTitle>
                        <CardDescription>These actions are waiting for approval from administrators.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Requested By</TableHead><TableHead>Approvals</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {paginatedPending.length > 0 ? paginatedPending.map(req => (
                                    <TableRow key={req.id}>
                                        <TableCell>{getActionDescription(req)}</TableCell>
                                        <TableCell>{req.requestedBy.name}</TableCell>
                                        <TableCell>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge>{req.approvals.length} / {req.requiredApprovals}</Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Approved by: {req.approvals.map(a => a.name).join(', ')}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell>{req.createdAt ? formatDistanceToNow(new Date(req.createdAt), { addSuffix: true }) : 'Just now'}</TableCell>
                                        <TableCell>
                                            {!hasAlreadyVoted(req) ? (
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={() => handleApproveClick(req)}><Check className="mr-2 h-4 w-4"/>Approve</Button>
                                                    <Button size="sm" variant="destructive" disabled><X className="mr-2 h-4 w-4"/>Reject</Button>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">You have voted</p>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">No pending requests.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                         <div className="flex items-center justify-end space-x-2 py-4">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPendingPage(p => Math.max(p - 1, 1))} disabled={currentPendingPage === 1}>Previous</Button>
                            <span className="text-sm text-muted-foreground">Page {currentPendingPage} of {totalPendingPages > 0 ? totalPendingPages : 1}</span>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPendingPage(p => Math.min(p + 1, totalPendingPages))} disabled={currentPendingPage === totalPendingPages || totalPendingPages === 0}>Next</Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="resolved">
                <Card>
                    <CardHeader>
                        <CardTitle>Resolved Requests</CardTitle>
                        <CardDescription>A history of all past approval requests.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Status</TableHead><TableHead>Requested By</TableHead><TableHead>Resolved By</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {paginatedResolved.length > 0 ? paginatedResolved.map(req => (
                                    <TableRow key={req.id}>
                                        <TableCell>{getActionDescription(req)}</TableCell>
                                        <TableCell><Badge variant={req.status === 'approved' ? 'default' : 'destructive'} className={req.status === 'approved' ? 'bg-green-600' : ''}>{req.status}</Badge></TableCell>
                                        <TableCell>{req.requestedBy.name}</TableCell>
                                        <TableCell>{req.resolvedBy || 'N/A'}</TableCell>
                                        <TableCell>{req.createdAt ? format(new Date(req.createdAt), 'PP p') : 'N/A'}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">No resolved requests.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                         <div className="flex items-center justify-end space-x-2 py-4">
                            <Button variant="outline" size="sm" onClick={() => setCurrentResolvedPage(p => Math.max(p - 1, 1))} disabled={currentResolvedPage === 1}>Previous</Button>
                            <span className="text-sm text-muted-foreground">Page {currentResolvedPage} of {totalResolvedPages > 0 ? totalResolvedPages : 1}</span>
                            <Button variant="outline" size="sm" onClick={() => setCurrentResolvedPage(p => Math.min(p + 1, totalResolvedPages))} disabled={currentResolvedPage === totalResolvedPages || totalResolvedPages === 0}>Next</Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        <PinDialog
            open={isPinDialogOpen}
            onOpenChange={setIsPinDialogOpen}
            onSuccess={() => handleApprove(selectedRequest)}
            actionDescription={`Approve request: ${selectedRequest ? getActionDescription(selectedRequest) : ''}`}
        />
      </>
  );
}
