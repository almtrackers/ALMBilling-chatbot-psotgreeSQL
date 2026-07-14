
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Button } from '@/components/ui/button';
import { format, isWithinInterval, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { ServerCrash, FileText, MoreHorizontal, RefreshCw, Printer, Loader2, Edit, Check, Clock, Phone } from 'lucide-react';
import { useInvoices } from '@/hooks/use-invoices';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { Invoice, Device, AppSettings } from '@/lib/types';
import { useAppSettings } from '@/hooks/use-app-settings';
import { addLog } from '@/lib/log-service';
import { useDevices } from '@/hooks/use-devices';
import { useBillingHealth, type BillingHistoryRow } from '@/hooks/use-billing-health';
import BillingBreakdownDialog from '@/components/dashboard/billing-health/billing-breakdown-dialog';
import type { DateRange } from 'react-day-picker';
import { triggerInvoiceRobocall, isWithinCallingHours } from '@/lib/robocall-service';
import { getRobocallLogs } from '@/lib/api';
import { startOfMonth, startOfYear, addMonths, addYears } from 'date-fns';

import ResolveUserDialog from './resolve-user-dialog';
import EditInvoiceForm from './edit-invoice-form';
import PinDialog from '@/components/auth/pin-dialog';
import ExtendSubscriptionDialog from './extend-subscription-dialog';

const RECORDS_PER_PAGE = 15;

type InvoiceListProps = {
  searchTerm: string;
  dateRange?: DateRange;
  statusFilter?: string[];
};

async function updateInvoiceApi(id: string, data: Partial<Invoice>) {
  const response = await fetch(`/api/invoices/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update invoice');
  return response.json();
}

async function deleteInvoiceApi(id: string) {
  const response = await fetch(`/api/invoices/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete invoice');
  return response.json();
}

export default function InvoiceList({ searchTerm, dateRange, statusFilter = ['all'] }: InvoiceListProps) {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const { devices } = useDevices();
  const { invoicesWithDetails, isLoading, isError, mutate: mutateInvoices } = useInvoices();
  const { appSettings, isLoading: isLoadingSettings } = useAppSettings();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isExtendDialogOpen, setIsExtendDialogOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [isPinForDeleteOpen, setIsPinForDeleteOpen] = useState(false);
  const [isResolveUserDialogOpen, setIsResolveUserDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [callingInvoiceId, setCallingInvoiceId] = useState<string | null>(null);
  
  const { billingHistory } = useBillingHealth();
  const [isBreakdownDialogOpen, setIsBreakdownDialogOpen] = useState(false);
  const [selectedBillingRow, setSelectedBillingRow] = useState<BillingHistoryRow | null>(null);

  const { toast } = useToast();





  const openDeleteDialog = (id: string) => {
    const invoice = invoicesWithDetails?.find(i => i.invoice.id === id)?.invoice;
    if (invoice) {
        setSelectedInvoice(invoice);
        setIsPinForDeleteOpen(true);
    }
  };







  const now = new Date();

  const filteredInvoices = useMemo(() => {
    if (!invoicesWithDetails) return [];
    
    let filtered = invoicesWithDetails;

    // Date range filter
    if (dateRange?.from) {
      filtered = filtered.filter(({ invoice }) => {
        if (!invoice.createdAt) return false;
        const interval = { start: dateRange.from!, end: dateRange.to || dateRange.from! };
        const createdAt = new Date(invoice.createdAt);
        return isWithinInterval(createdAt, interval);
      });
    }

    // Search term filter (ID, device name, customer name, or contact)
    if (searchTerm) {
      filtered = filtered.filter(({ invoice, devices, userName, contact }) => {
        const searchTermLower = searchTerm.toLowerCase();
        const idMatch = invoice.id?.toLowerCase().includes(searchTermLower);
        const deviceNameMatch = devices.some(device => 
          device.name.toLowerCase().includes(searchTermLower)
        );
        const userNameMatch = userName.toLowerCase().includes(searchTermLower);
        const contactMatch = contact?.toLowerCase().includes(searchTermLower);
        return idMatch || deviceNameMatch || userNameMatch || contactMatch;
      });
    }

    // Status filter
    if (statusFilter && !statusFilter.includes('all')) {
      filtered = filtered.filter(({ invoice }) => {
        const periodEnd = invoice.periodEnd ? new Date(invoice.periodEnd) : null;
        const isExpired =
          invoice.status === 'pending' &&
          periodEnd &&
          periodEnd < now;

        const extensionGrantedAt = invoice.extensionGrantedAt ? new Date(invoice.extensionGrantedAt) : null;
        const hasExtensionExpired =
          !!invoice.extensionDays &&
          !!extensionGrantedAt &&
          differenceInDays(now, extensionGrantedAt) >
            invoice.extensionDays;

        return statusFilter.some(filter => {
          switch (filter) {
            case 'paid':
              return invoice.status === 'paid';
            case 'pending':
              return invoice.status === 'pending' && !isExpired && !hasExtensionExpired;
            case 'expired':
              return isExpired;
            case 'rolled-over':
              return invoice.status === 'rolled-over';
            case 'extension_expired':
              return hasExtensionExpired;
            default:
              return true;
          }
        });
      });
    }

    return filtered;

  }, [invoicesWithDetails, searchTerm, dateRange, statusFilter, now]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateRange, statusFilter]);

  // Fetch call statuses from robocall logs
  useEffect(() => {
    const fetchCallStatuses = async () => {
      if (!invoicesWithDetails || invoicesWithDetails.length === 0 || !isAdmin) return;

      const pendingCalled = invoicesWithDetails.filter(
        ({ invoice }) => invoice.status === 'pending' && invoice.lastCallPromptId
      );
      if (pendingCalled.length === 0) return;

      for (const { invoice } of pendingCalled) {
        const logs = await getRobocallLogs({
          rcId: invoice.lastCallPromptId || invoice.id,
          limit: 1,
        });
        if (logs && logs.length > 0) {
          const latestLog = logs[0];
          if (latestLog.callStatus !== invoice.lastCallStatus) {
            await updateInvoiceApi(invoice.id, {
              lastCallStatus: latestLog.callStatus || 'unknown',
            });
            mutateInvoices();
          }
        }
      }
    };

    fetchCallStatuses();
    const interval = setInterval(fetchCallStatuses, 120000);
    return () => clearInterval(interval);
  }, [invoicesWithDetails, isAdmin, mutateInvoices]);
  
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    return filteredInvoices.slice(startIndex, startIndex + RECORDS_PER_PAGE);
  }, [filteredInvoices, currentPage]);

  const totalPages = Math.ceil(filteredInvoices.length / RECORDS_PER_PAGE);

  const { paidTotal, pendingTotal } = useMemo(() => {
    return filteredInvoices.reduce((totals, { invoice }) => {
      if (invoice.status === 'paid') {
        totals.paidTotal += invoice.totalAmount;
      } else if (invoice.status === 'pending') {
        totals.pendingTotal += invoice.totalAmount;
      }
      return totals;
    }, { paidTotal: 0, pendingTotal: 0 });
  }, [filteredInvoices]);

  const handleMarkAsPaidClick = (invoice: Invoice) => {
    handleMarkAsPaid(invoice);
  };

  const executeUnpaidReversal = async (invoice: Invoice) => {
    if (!user) return;
    try {
        await updateInvoiceApi(invoice.id, { status: 'pending', paidAt: null, paidBy: null });
        
        const deviceIdsToRevert = Array.isArray(invoice.deviceIds) ? invoice.deviceIds : (typeof invoice.deviceIds === 'string' ? JSON.parse(invoice.deviceIds) : []);
        for(const deviceId of deviceIdsToRevert) {
            await fetch('/api/traccar/devices/expiry/reverse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deviceId, periodEndDate: invoice.periodEnd }),
            });
        }
        await addLog(`(Auto-Approved) Reverted invoice #${invoice.id} to Pending`, user.name, 'update');
        toast({ title: 'Action Completed', description: 'Invoice marked as pending and device expiry reverted.' });
        mutateInvoices();
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Reversal Failed", description: e.message });
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice | null) => {
    if (!invoice || !user || !isAdmin || !appSettings || !devices) return;

    const paidByName = user?.name || 'Unknown Admin';

    try {
      await updateInvoiceApi(invoice.id, {
        status: 'paid',
        paidAt: new Date(),
        paidBy: paidByName,
      });
      await addLog(`Marked invoice #${invoice.id} as Paid`, user.name, 'update');

      const deviceIds = Array.isArray(invoice.deviceIds) ? invoice.deviceIds : (typeof invoice.deviceIds === 'string' ? JSON.parse(invoice.deviceIds) : []);
      if (deviceIds.length > 0) {
        for (const deviceId of deviceIds) {
          const device = devices.find(d => d.id === deviceId);
          if (!device) continue;

          // Dynamically determine duration type from device attributes
          const renewalFee = Number(device.attributes?.renewalFee || device.attributes?.renewal_fee || 0);
          const durationType = renewalFee > appSettings.monthlyYearlyThreshold ? 'yearly' : 'monthly';
          
          let finalExpiryDaysToAdd: number | undefined = undefined;
          if (invoice.extensionDays && invoice.extensionGrantedAt) {
              const extensionGrantedAt = new Date(invoice.extensionGrantedAt);
              const usedExtensionDays = differenceInDays(new Date(), extensionGrantedAt);
              const baseDuration = durationType === 'yearly' ? 365 : 30;
              finalExpiryDaysToAdd = baseDuration - usedExtensionDays;
          }

          await fetch('/api/traccar/devices/expiry/extend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId,
              targetExpiry: invoice.periodEnd,
              durationType,
              daysToAdd: finalExpiryDaysToAdd
            }),
          });
        }
      }
      toast({
        title: 'Invoice Paid & Devices Extended',
        description: 'The invoice has been marked as paid and device expiries have been updated on the server.',
      });
      await addLog(`Extended device expiries from invoice #${invoice.id} payment`, user.name, 'update');
      mutateInvoices(); // Refresh the list
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Server Update Failed',
        description: `The invoice was paid, but we failed to extend device expiries on the server. Please update manually. Error: ${error.message}`,
      });
    }
  };
  

  const handleStatusChange = async (invoice: Invoice) => {
    if (!user || !isAdmin || !user.email) {
        toast({ variant: 'destructive', title: 'Authentication Error', description: 'Cannot verify your identity.' });
        return;
    }
    
    if (invoice.status === 'paid') {
      const deviceIds = Array.isArray(invoice.deviceIds) ? invoice.deviceIds : (typeof invoice.deviceIds === 'string' ? JSON.parse(invoice.deviceIds) : []);
      const payload = { 
          invoiceId: invoice.id,
          deviceIds,
          periodEnd: new Date(invoice.periodEnd).toISOString(),
      };
      
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'mark_invoice_unpaid',
          targetId: invoice.id,
          payload,
          requestedBy: { uid: user.email, name: user.name }
        }),
      });
      const result = await response.json();

      if (result.status === 'auto_approved') {
          await executeUnpaidReversal(invoice);
      } else {
        toast({ title: 'Approval Requested', description: 'This action requires approval.' });
      }

    } else {
      handleMarkAsPaidClick(invoice);
    }
  };



  
  const confirmDeletion = () => {
    setIsAlertOpen(false);
    handleDelete();
  };

  const handleDelete = async () => {
    if (!selectedInvoice || !user || !isAdmin) return;

    try {
      // If the invoice had an extension, revert the expiry on Traccar
      if (selectedInvoice.extensionDays && selectedInvoice.extensionDays > 0) {
        toast({ title: 'Reverting Extension...', description: 'Setting device expiry back to original date.' });
        const deviceIds = Array.isArray(selectedInvoice.deviceIds) ? selectedInvoice.deviceIds : (typeof selectedInvoice.deviceIds === 'string' ? JSON.parse(selectedInvoice.deviceIds) : []);
        for (const deviceId of deviceIds) {
          await fetch('/api/traccar/devices/expiry/reverse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, periodEndDate: selectedInvoice.periodEnd }),
          });
        }
        await addLog(`Reverted device expiry for invoice #${selectedInvoice.id} upon deletion`, user.name, 'update');
      }

      await deleteInvoiceApi(selectedInvoice.id);
      await addLog(`Deleted invoice #${selectedInvoice.id}`, user.name, 'delete');
      
      toast({
        title: 'Invoice Deleted',
        description: `Invoice #${selectedInvoice.id} has been removed.`,
      });
      setSelectedInvoice(null);
      mutateInvoices();
    } catch(error: any) {
        toast({
            variant: 'destructive',
            title: 'Deletion Failed',
            description: error.message || 'An unexpected error occurred during deletion.'
        });
    } finally {
        setIsPinForDeleteOpen(false);
    }
  };

  const openEditDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsEditDialogOpen(true);
  };

  const openExtendDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsExtendDialogOpen(true);
  };
  
  const handlePrintReceipt = (invoice: Invoice, userName: string, devices: Device[]) => {
    const query = new URLSearchParams({
      userName,
      devices: JSON.stringify(devices),
    });
    router.push(`/dashboard/invoices/${invoice.id}/receipt?${query.toString()}`);
  };

  const handleManualCall = async (invoice: Invoice, devices: Device[]) => {
    if (!user) return;
    
    // Payment reminders are only for pending invoices, not paid or rolled-over
    if (invoice.status === 'paid' || invoice.status === 'rolled-over') {
      toast({
        variant: 'destructive',
        title: 'Cannot Call',
        description: 'Payment reminders are only for pending invoices. This invoice is already paid or rolled-over.',
      });
      return;
    }
    
    setCallingInvoiceId(invoice.id);
    
    try {
      // Get phone number from first device
      const deviceIds = Array.isArray(invoice.deviceIds) ? invoice.deviceIds : (typeof invoice.deviceIds === 'string' ? JSON.parse(invoice.deviceIds) : []);
      const firstDeviceId = deviceIds?.[0];
      if (!firstDeviceId) {
        toast({
          variant: 'destructive',
          title: 'No Device Found',
          description: 'Cannot find device for this invoice.',
        });
        return;
      }
      
      const device = devices.find(d => d.id === firstDeviceId);
      if (!device) {
        toast({
          variant: 'destructive',
          title: 'Device Not Found',
          description: 'Device associated with this invoice was not found.',
        });
        return;
      }
      
      const phoneNumber = device.attributes?.phoneRobocall || device.attributes?.phone;
      if (!phoneNumber) {
        toast({
          variant: 'destructive',
          title: 'No Phone Number',
          description: 'No phone number found for this device.',
        });
        return;
      }
      
      // Make the call (Invoice ID is used as prompt_id/rcId)
      const result = await triggerInvoiceRobocall(
        invoice,
        phoneNumber,
        device.name,
        4 // Expiry Alert voice ID
      );
      
      // Update invoice with call status
      await updateInvoiceApi(invoice.id, {
        lastCallPromptId: invoice.id, // Store Invoice ID as prompt_id
        lastCallDate: new Date(),
        lastCallStatus: 'pending', // Initially pending, will be updated from logs
      });
      
      if (result.success) {
        await addLog(
          `Manually called customer for invoice #${invoice.id} (rcId: ${invoice.id})`,
          user.name,
          'update'
        );
        toast({
          title: 'Call Initiated',
          description: `Robocall sent to ${phoneNumber}. Call status will be updated shortly.`,
        });
        
        // Refresh call status after a few seconds
        setTimeout(async () => {
          try {
            const logs = await getRobocallLogs({ rcId: invoice.id, limit: 1 });
            if (logs && logs.length > 0) {
              const latestLog = logs[0];
              await updateInvoiceApi(invoice.id, {
                lastCallStatus: latestLog.callStatus || 'unknown',
              });
              mutateInvoices();
            }
          } catch (error) {
            console.error('Failed to update call status:', error);
          }
        }, 5000);
      } else {
        await addLog(
          `Failed to call customer for invoice #${invoice.id}: ${result.error}`,
          user.name,
          'update'
        );
        toast({
          variant: 'destructive',
          title: 'Call Failed',
          description: result.error || 'Failed to initiate robocall.',
        });
      }
      
      mutateInvoices(); // Refresh the list
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Call Error',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setCallingInvoiceId(null);
    }
  };

  const handleSettleBill = async (invoice: Invoice, devices: Device[]) => {
    if (!user || !appSettings) return;
    setIsSettling(true);

    try {
      let totalNewAmount = 0;
      const today = new Date();
      let overallDurationType: 'monthly' | 'yearly' = 'monthly';

      const deviceIds = Array.isArray(invoice.deviceIds) ? invoice.deviceIds : (typeof invoice.deviceIds === 'string' ? JSON.parse(invoice.deviceIds) : []);
      for (const deviceId of deviceIds) {
        const device = devices.find(d => d.id === deviceId);
        if (!device) continue;

        const renewalFee = Number(device.attributes?.renewalFee || device.attributes?.renewal_fee || 0);
        if (renewalFee === 0) continue;

        const threshold = appSettings.monthlyYearlyThreshold || 2000;
        const periodType = renewalFee > threshold ? 'yearly' : 'monthly';
        if (periodType === 'yearly') overallDurationType = 'yearly';
        
        const dailyRate = periodType === 'yearly' ? renewalFee / 365 : renewalFee / 30;

        let endOfPeriod: Date;
        if (periodType === 'monthly') {
          endOfPeriod = startOfMonth(addMonths(today, 1));
        } else {
          endOfPeriod = startOfYear(addYears(today, 1));
        }

        const remainingDays = differenceInDays(endOfPeriod, today);
        const charges = Math.round(dailyRate * remainingDays);
        totalNewAmount += charges;
      }

      // Calculate due date and expiry date based on new rules
      const dueDate = startOfMonth(today);
      let expiryDate: Date;
      if (overallDurationType === 'monthly') {
        const nextMonth = addMonths(today, 1);
        expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
      } else {
        const nextYear = addYears(today, 1);
        expiryDate = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59); // Feb 15th
      }

      await updateInvoiceApi(invoice.id, {
        totalAmount: totalNewAmount,
        baseAmount: totalNewAmount,
        dueDate: dueDate,
        expiryDate: expiryDate,
        durationType: overallDurationType,
        notes: (invoice.notes || '') + ` | Settled on ${format(today, 'PP')} based on new pricing logic.`,
      });

      await addLog(`Settled old invoice #${invoice.id} with new pricing logic. New total: ${totalNewAmount}`, user.name, 'update');
      
      toast({
        title: 'Invoice Settled',
        description: `Invoice #${invoice.id} has been recalculated based on remaining days.`,
      });
      mutateInvoices();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Settlement Failed',
        description: error.message || 'An error occurred while settling the bill.',
      });
    } finally {
      setIsSettling(false);
    }
  };

  const handlePayFuture = async (invoice: Invoice, devices: Device[]) => {
    if (!user || !appSettings || !devices) return;
    
    try {
      // 1. Mark current invoice as paid if it's pending
      if (invoice.status === 'pending') {
        await handleMarkAsPaid(invoice);
      }

      // 2. Generate a new invoice for the next period and mark it as paid
      let totalAmount = 0;
      let earliestNextPeriodStart: Date | null = null;
      let latestNextPeriodEnd: Date | null = null;
      let overallDurationType: 'monthly' | 'yearly' = 'monthly';

      const deviceIds = Array.isArray(invoice.deviceIds) ? invoice.deviceIds : (typeof invoice.deviceIds === 'string' ? JSON.parse(invoice.deviceIds) : []);
      for (const deviceId of deviceIds) {
        const device = devices.find(d => d.id === deviceId);
        if (!device) continue;

        const renewalFee = Number(device.attributes?.renewalFee || device.attributes?.renewal_fee || 0);
        const durationType = renewalFee > appSettings.monthlyYearlyThreshold ? 'yearly' : 'monthly';
        if (durationType === 'yearly') overallDurationType = 'yearly';

        const simCharges = Number(device.attributes?.simCharges) || 0;
        const otherCharges = Number(device.attributes?.otherCharges) || 0;
        const discount = Number(device.attributes?.discount) || 0;
        const periodCost = renewalFee + simCharges + otherCharges - discount;
        totalAmount += periodCost;

        // Current expiry from device
        const currentExpiryValue = device.attributes?.expiryDate || device.expirationTime;
        const currentExpiry = currentExpiryValue ? new Date(currentExpiryValue) : new Date(invoice.periodEnd);
        const nextPeriodStart = currentExpiry;
        const nextPeriodEnd = durationType === 'yearly' ? addYears(currentExpiry, 1) : addMonths(currentExpiry, 1);

        if (!earliestNextPeriodStart || nextPeriodStart < earliestNextPeriodStart) earliestNextPeriodStart = nextPeriodStart;
        if (!latestNextPeriodEnd || nextPeriodEnd > latestNextPeriodEnd) latestNextPeriodEnd = nextPeriodEnd;

        // Extend device expiry on Traccar
        await fetch('/api/traccar/devices/expiry/extend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, targetExpiry: nextPeriodEnd, durationType }),
        });
      }

      // Generate new invoice record
      const today = new Date();
      const dueDate = startOfMonth(today);
      let expiryDate: Date;
      if (overallDurationType === 'monthly') {
        const nextMonth = addMonths(today, 1);
        expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
      } else {
        const nextYear = addYears(today, 1);
        expiryDate = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59); // Feb 15th
      }

      const newInvoiceId = `INV-FUT-${Date.now()}`;
      const newInvoice: Partial<Invoice> & { id: string } = {
        id: newInvoiceId,
        deviceIds: invoice.deviceIds,
        customerIdentifier: invoice.customerIdentifier,
        customerName: invoice.customerName,
        totalAmount: totalAmount,
        baseAmount: totalAmount,
        status: 'paid',
        paidAt: new Date(),
        paidBy: user.name,
        createdAt: new Date(),
        periodStart: earliestNextPeriodStart || today,
        periodEnd: latestNextPeriodEnd || today,
        dueDate: dueDate,
        expiryDate: expiryDate,
        durationType: overallDurationType,
        notes: `Advance payment for next period. Generated from invoice #${invoice.id}.`,
      };

      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInvoice),
      });
      await addLog(`Created and paid advance invoice #${newInvoiceId} for ${invoice.customerName}`, user.name, 'create');

      toast({
        title: 'Future Period Paid',
        description: `Advance invoice #${newInvoiceId} generated and marked as paid.`,
      });
      mutateInvoices();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Future Payment Failed',
        description: error.message || 'An error occurred while processing future payment.',
      });
    }
  };

  const handleRefresh = async () => {
    if (!user || !isAdmin) return;
    setIsRefreshing(true);
    await addLog('Manually triggered automated invoice generation (Force)', user.name, 'automation');
    try {
      await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName: user.name, force: true }),
      });
      toast({
        title: 'Generation Triggered',
        description: 'Invoice generation has been started in the background.',
      });
      mutateInvoices();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: error.message || 'Failed to trigger invoice generation.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
          <CardDescription>Fetching your invoices...</CardDescription>
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
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ServerCrash className="h-4 w-4" />
            <AlertTitle>Failed to load invoices</AlertTitle>
            <AlertDescription>
              There was a problem fetching your invoice data. Please check your
              connection and try again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (invoice: Invoice) => {
    const isExpired =
      invoice.status === 'pending' &&
      invoice.periodEnd &&
      invoice.periodEnd < now;

    const hasExtensionExpired =
      !!invoice.extensionDays &&
      !!invoice.extensionGrantedAt &&
      differenceInDays(now, invoice.extensionGrantedAt) >
        invoice.extensionDays;

    if (invoice.status === 'paid') {
      return (
        <div className="flex flex-col gap-1">
          <Badge className="bg-green-500 hover:bg-green-600">Paid</Badge>
          {invoice.requiresReview && (
            <Badge variant="outline" className="border-red-500 text-red-700 animate-pulse">
              Review Required
            </Badge>
          )}
        </div>
      );
    }

    if (invoice.status === 'rolled-over') {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700">
          Expired (Rolled Over)
        </Badge>
      );
    }

    if (hasExtensionExpired) {
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="secondary" className="bg-orange-500 hover:bg-orange-600">
            Extension Expired
          </Badge>
          {invoice.requiresReview && (
            <Badge variant="outline" className="border-red-500 text-red-700 animate-pulse">
              Review Required
            </Badge>
          )}
        </div>
      );
    }

    if (isExpired) {
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="destructive">Expired</Badge>
          {invoice.requiresReview && (
            <Badge variant="outline" className="border-red-500 text-red-700 animate-pulse">
              Review Required
            </Badge>
          )}
        </div>
      );
    }

    if (invoice.extensionDays) {
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="secondary" className="bg-blue-500">Extended</Badge>
          {invoice.requiresReview && (
            <Badge variant="outline" className="border-red-500 text-red-700 animate-pulse">
              Review Required
            </Badge>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        <Badge variant="destructive">Pending</Badge>
        {invoice.requiresReview && (
          <Badge variant="outline" className="border-red-500 text-red-700 animate-pulse">
            Review Required
          </Badge>
        )}
      </div>
    );
  };

  const getDaysRemaining = (date: Date) => {
    const days = differenceInDays(date, now);
    
    if (days < 0) {
      return <span className="text-xs text-destructive font-medium">{Math.abs(days)} days overdue</span>;
    }
    if (days === 0) {
      return <span className="text-xs text-orange-500 font-medium">Expires today</span>;
    }
    return <span className="text-xs text-muted-foreground">{days} days remaining</span>;
  };

  const getInvoiceDaysRemaining = (invoice: Invoice) => {
    if (!invoice.periodEnd) return null;
    return getDaysRemaining(new Date(invoice.periodEnd));
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Invoice History</CardTitle>
            <CardDescription>
              A list of all generated invoices for your devices.
            </CardDescription>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
             {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Devices</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Billing Period</TableHead>
                <TableHead>Paid Info</TableHead>
                {isAdmin && (
                  <TableHead>Call Status & Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedInvoices && paginatedInvoices.length > 0 ? (
                paginatedInvoices.map(({ invoice, devices, userName, contact }) => (
                  <TableRow key={invoice.id}>
                     <TableCell className="font-medium">
                      {contact || 'N/A'}
                      {invoice.previousDues && (
                        <div className="text-xs text-destructive">
                            Includes PKR {invoice.previousDues.toLocaleString()} in previous dues.
                        </div>
                      )}
                    </TableCell>
                     <TableCell className="font-medium">
                      {userName}
                    </TableCell>
                    <TableCell>
                      {devices && devices.length > 0
                        ? (
                          <div className="flex flex-col gap-1">
                            {devices.map(d => (
                              <div key={d.id} className="text-sm">
                                <button
                                  className="text-primary hover:underline font-semibold text-left"
                                  onClick={() => {
                                    const row = billingHistory.find(r => r.deviceId === d.id);
                                    if (row) {
                                      setSelectedBillingRow(row);
                                      setIsBreakdownDialogOpen(true);
                                    } else {
                                      toast({
                                        title: 'Breakdown Not Available',
                                        description: 'Billing details for this device could not be found.',
                                      });
                                    }
                                  }}
                                >
                                  {d.name}
                                </button>
                                {(d.attributes?.expiryDate || d.expirationTime) && (
                                  <div className="flex flex-col ml-2">
                                    <span className="text-xs text-muted-foreground">
                                      Exp: {format(new Date(d.attributes?.expiryDate || d.expirationTime), 'PP')}
                                    </span>
                                    {getDaysRemaining(new Date(d.attributes?.expiryDate || d.expirationTime))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                        : (invoice.deviceIds && `IDs: ${Array.isArray(invoice.deviceIds) ? invoice.deviceIds.join(', ') : invoice.deviceIds}`) || 'N/A'
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getStatusBadge(invoice)}
                        {getInvoiceDaysRemaining(invoice)}
                      </div>
                    </TableCell>
                    <TableCell>
                      PKR {invoice.totalAmount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invoice.periodStart), 'PP')} -{' '}
                      {format(new Date(invoice.periodEnd), 'PP')}
                    </TableCell>
                    <TableCell>
                      {invoice.paidAt ? (
                        <div className="text-xs">
                          <div>{format(new Date(invoice.paidAt), 'PP')}</div>
                          <div className="text-muted-foreground">
                            by {invoice.paidBy}
                          </div>
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {/* Call Status */}
                          <div className="flex flex-col gap-1 flex-1">
                            {(() => {
                              const status = invoice.lastCallStatus;
                              
                              if (status) {
                                const statusLower = status.toLowerCase();
                                return (
                                  <>
                                    <Badge 
                                      variant={
                                        statusLower === 'completed' || statusLower === 'success' ? 'default' :
                                        statusLower === 'failed' || statusLower === 'error' ? 'destructive' :
                                        'secondary'
                                      }
                                      className="text-xs"
                                    >
                                      {statusLower === 'completed' || statusLower === 'success' ? 'Called' :
                                       statusLower === 'failed' || statusLower === 'error' ? 'Failed' :
                                       statusLower === 'pending' || statusLower === 'processing' ? 'Pending' :
                                       'Unknown'}
                                    </Badge>
                                    {invoice.lastCallDate && (
                                      <span className="text-xs text-muted-foreground">
                                        {format(new Date(invoice.lastCallDate), 'PPp')}
                                      </span>
                                    )}
                                    {invoice.autoCallMade && (
                                      <span className="text-xs text-blue-600">Auto-called</span>
                                    )}
                                  </>
                                );
                              }
                              
                              if (invoice.status === 'pending' && !invoice.lastCallStatus) {
                                return <span className="text-xs text-muted-foreground">Not called</span>;
                              }
                              
                              return null;
                            })()}
                          </div>
                          
                          {/* Actions Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                aria-haspopup="true"
                                size="icon"
                                variant="ghost"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handlePrintReceipt(invoice, userName, devices)}>
                                <Printer className="mr-2 h-4 w-4" />
                                Print Receipt
                              </DropdownMenuItem>
                              {invoice.requiresReview && (
                                <DropdownMenuItem onClick={() => {
                                  setSelectedInvoice(invoice);
                                  setIsResolveUserDialogOpen(true);
                                }}>
                                  <Check className="mr-2 h-4 w-4" />
                                  Resolve Billing User
                                </DropdownMenuItem>
                              )}
                              {invoice.status === 'paid' ? (
                                <DropdownMenuItem onClick={() => handleStatusChange(invoice)}>
                                  Request to Mark as Pending
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  {invoice.status !== 'rolled-over' ? (
                                    <DropdownMenuItem onClick={() => handleStatusChange(invoice)}>
                                      <Check className="mr-2 h-4 w-4" />
                                      Mark as Paid
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem disabled>
                                      Cannot pay rolled-over invoice
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => openEditDialog(invoice)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleSettleBill(invoice, devices)}
                                    disabled={isSettling}
                                  >
                                    <RefreshCw className={cn("mr-2 h-4 w-4", isSettling && "animate-spin")} />
                                    Settle Bill (New Logic)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handlePayFuture(invoice, devices)}>
                                    <Clock className="mr-2 h-4 w-4" />
                                    Pay for Future Period
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openExtendDialog(invoice)}>
                                    <Clock className="mr-2 h-4 w-4" />
                                    Extend Subscription
                                  </DropdownMenuItem>
                                  {invoice.status === 'pending' && (
                                    <DropdownMenuItem 
                                      onClick={() => handleManualCall(invoice, devices)}
                                      disabled={callingInvoiceId === invoice.id}
                                    >
                                      <Phone className="mr-2 h-4 w-4" />
                                      {callingInvoiceId === invoice.id ? 'Calling...' : 'Call Customer (Payment Reminder)'}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    onClick={() => openDeleteDialog(invoice.id)}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                 <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                       {searchTerm || dateRange ? (
                        <>
                          <p>No Invoices Found</p>
                          <p className="text-xs">No invoices match your current filters.</p>
                        </>
                      ) : (
                         <>
                          <p>No invoices found.</p>
                          <p className="text-xs">
                            Invoices will appear here once they are generated
                            automatically or manually.
                          </p>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 7} className="text-right">
                        <div className="flex justify-end gap-6 font-semibold">
                            <span>Pending Total: PKR {pendingTotal.toLocaleString()}</span>
                            <span>Paid Total: PKR {paidTotal.toLocaleString()}</span>
                        </div>
                    </TableCell>
                </TableRow>
            </TableFooter>
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
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              invoice from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmDeletion}
            >
              Yes, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Edit Invoice</DialogTitle>
                <DialogDescription>
                    Adjust the financial details for this pending invoice. The total will be recalculated automatically.
                </DialogDescription>
            </DialogHeader>
            {selectedInvoice && (
                <EditInvoiceForm 
                    invoice={selectedInvoice}
                    setDialogOpen={setIsEditDialogOpen}
                />
            )}
        </DialogContent>
      </Dialog>
      
      <ExtendSubscriptionDialog
        open={isExtendDialogOpen}
        onOpenChange={setIsExtendDialogOpen}
        invoice={selectedInvoice}
      />
      
      <PinDialog
        open={isPinDialogOpen}
        onOpenChange={setIsPinDialogOpen}
        onSuccess={() => handleMarkAsPaid(selectedInvoice)}
        actionDescription={`Mark invoice #${selectedInvoice?.id} as paid`}
      />
      
      <PinDialog
        open={isPinForDeleteOpen}
        onOpenChange={setIsPinForDeleteOpen}
        onSuccess={handleDelete}
        actionDescription={`delete invoice #${selectedInvoice?.id}`}
      />

      <BillingBreakdownDialog
        open={isBreakdownDialogOpen}
        onOpenChange={setIsBreakdownDialogOpen}
        row={selectedBillingRow}
      />

      <ResolveUserDialog
        open={isResolveUserDialogOpen}
        onOpenChange={setIsResolveUserDialogOpen}
        invoice={selectedInvoice}
        onSuccess={() => mutateInvoices()}
      />
    </>
  );
}
