
'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useDevices } from './use-devices';
import type { Invoice, Device, TraccarUser } from '@/lib/types';
import { useTraccarUsers } from './use-traccar-users';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export type InvoiceWithDetails = {
  invoice: Invoice;
  devices: Device[];
  userName: string;   // Display name for UI/receipts
  contact: string;    // Primary contact source (email or phone/username)
};

export function useInvoices() {
  const { devices, isLoading: isLoadingDevices, isError: isErrorDevices, mutate: mutateDevices } = useDevices();
  const { users, isLoading: isLoadingUsers, isError: isErrorUsers } = useTraccarUsers();
  
  const {
    data: invoices,
    isLoading: isLoadingInvoices,
    error: errorInvoices,
    mutate: mutateInvoices,
  } = useSWR<Invoice[]>('/api/invoices', fetcher);

  const invoicesWithDetails: InvoiceWithDetails[] | null = useMemo(() => {
    if (!invoices || !Array.isArray(invoices) || !devices || !Array.isArray(devices) || !users || !Array.isArray(users)) return null;

    const deviceMap = new Map(devices.map(d => [d.id, d]));
    const userMap = new Map(users.map(u => [u.id, u as TraccarUser]));

    return invoices.map((invoice) => {
      let associatedDevices: Device[] = [];
      
      // Parse deviceIds if it's a string (JSON)
      let deviceIds: number[] = [];
      try {
        if (typeof invoice.deviceIds === 'string') {
          deviceIds = JSON.parse(invoice.deviceIds);
        } else if (Array.isArray(invoice.deviceIds)) {
          deviceIds = invoice.deviceIds;
        }
      } catch (e) {
        console.error('Error parsing deviceIds for invoice:', invoice.id, e);
      }

      if (deviceIds.length > 0) {
        associatedDevices = deviceIds
          .map(id => deviceMap.get(id))
          .filter((d): d is Device => !!d);
      } else if ((invoice as any).deviceId) {
        // Fallback for older single-device invoices
        const device = deviceMap.get((invoice as any).deviceId);
        if (device) {
          associatedDevices = [device];
        }
      }

      // Derive customer display name and primary contact
      let displayName = invoice.customerName || 'N/A';
      let contact = 'N/A';

      if (associatedDevices.length > 0) {
        const ownerId = associatedDevices[0].attributes?.uId;
        const owner = ownerId ? userMap.get(ownerId) : undefined;
        if (owner) {
          // Prefer explicit email, then phone, then username/name
          contact = owner.email || owner.phone || owner.name || 'N/A';
          if (!displayName || displayName === 'N/A') {
            displayName = owner.name || contact;
          }
        }
      }

      // Fallbacks if we still don't have a contact
      if (contact === 'N/A' && invoice.customerIdentifier) {
        contact = invoice.customerIdentifier;
      }

      if (!displayName || displayName === 'N/A') {
        displayName = invoice.customerName || contact || 'N/A';
      }

      return { invoice, devices: associatedDevices, userName: displayName, contact };
    });
  }, [invoices, devices, users]);

  const isLoading = isLoadingInvoices || isLoadingDevices || isLoadingUsers;
  const isError = errorInvoices || isErrorDevices || isErrorUsers;

  const mutate = () => {
    mutateDevices();
    mutateInvoices();
  };

  return { invoicesWithDetails, isLoading, isError, mutate };
}
