
'use client';

import { addLog } from '@/lib/log-service';
import type { ApprovalRequest } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

/**
 * Creates a request for an action that requires multi-user approval.
 * @param actionType The type of action being requested.
 * @param targetId The ID of the document/entity being acted upon.
 * @param payload Additional data required to execute the action upon approval.
 * @param requestedBy The user initiating the request.
 * @returns The ID of the newly created approval request, or null if failed.
 */
export async function createApprovalRequest(
  actionType: ApprovalRequest['actionType'],
  targetId: string,
  payload: any,
  requestedBy: { uid: string; name: string }
): Promise<string | null> {
  try {
    const response = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType, targetId, payload, requestedBy }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create approval request');
    }

    if (data.id === 'auto_approved') {
      toast({ 
        variant: 'default', 
        title: 'Action Approved', 
        description: data.message || "This action does not require additional approval." 
      });
      return 'auto_approved';
    }

    await addLog(`Approval requested for '${actionType}' on target '${targetId}'`, requestedBy.name, 'info');
    toast({
      title: 'Approval Requested',
      description: 'This action requires approval from other administrators.',
    });
    return data.id;
  } catch (error: any) {
    toast({
      variant: 'destructive',
      title: 'Failed to Create Approval Request',
      description: error.message,
    });
    return null;
  }
}
