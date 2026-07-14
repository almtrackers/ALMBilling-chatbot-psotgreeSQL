
'use client';

import { format } from 'date-fns';
import type { Invoice, Device } from './types';

const ROBOCALL_BASE_URL = 'https://callcenter.convexinteractive.com/cgi-bin/ALM_Trace/outbound.cgi';
const ROBOCALL_KEY = process.env.NEXT_PUBLIC_ROBOCALL_KEY || 'LN9tLL8kDS7lKBCR'; // Default key, should be in env

export type RobocallStatus = 'pending' | 'completed' | 'failed' | 'unknown';

export interface RobocallResult {
  success: boolean;
  promptId?: string;
  status?: RobocallStatus;
  error?: string;
}

/**
 * Checks if current time is within Pakistan timezone calling hours (1 PM - 8 PM)
 */
export function isWithinCallingHours(): boolean {
  // Pakistan is UTC+5
  const now = new Date();
  const pakistanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const hour = pakistanTime.getHours();
  return hour >= 13 && hour < 20; // 1 PM to 8 PM
}

/**
 * Triggers a robocall for an invoice
 * Uses Invoice ID as prompt_id/rcId to ensure uniqueness
 * @param invoice The invoice to call about
 * @param phoneNumber The phone number to call
 * @param vehicleNumber Optional vehicle number for the call
 * @param voiceId Voice ID (1-12) for the call type
 * @returns Result with prompt_id (Invoice ID) and status
 */
export async function triggerInvoiceRobocall(
  invoice: Invoice,
  phoneNumber: string,
  vehicleNumber?: string,
  voiceId: number = 4 // Default to Expiry Alert
): Promise<RobocallResult> {
  try {
    // Use Invoice ID as prompt_id/rcId to ensure uniqueness
    const promptId = invoice.id;
    
    // Format the expiry date for the call text
    const expiryDate = invoice.periodEnd.toDate();
    const expiryText = format(expiryDate, 'd MMMM'); // e.g., "2 February"
    
    // Use vehicle number from first device or fallback
    const carNumber = vehicleNumber || 'N/A';
    
    const params = new URLSearchParams({
      prompt_id: promptId,
      caller_id: phoneNumber,
      Car: carNumber,
      Text: expiryText,
      voice_id: voiceId.toString(),
      Key: ROBOCALL_KEY,
    });

    const url = `${ROBOCALL_BASE_URL}?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
    });

    const responseText = await response.text();
    
    // Check response - API returns 'Ok 200' on success
    if (response.ok && responseText.includes('Ok 200')) {
      return {
        success: true,
        promptId,
        status: 'completed',
      };
    } else {
      return {
        success: false,
        promptId,
        status: 'failed',
        error: responseText || `HTTP ${response.status}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      status: 'failed',
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Fetches robocall status for an invoice using Invoice ID (rcId)
 * @param invoiceId The Invoice ID to use as rcId
 * @returns The call status from robocall logs
 */
export async function getInvoiceRobocallStatus(invoiceId: string): Promise<RobocallStatus> {
  try {
    const response = await fetch(`/api/traccar/robocall-logs?rcId=${invoiceId}`);
    if (!response.ok) {
      return 'unknown';
    }
    const logs = await response.json();
    if (logs && logs.length > 0) {
      const latestLog = logs[0];
      const callStatus = latestLog.callStatus?.toLowerCase();
      if (callStatus === 'completed' || callStatus === 'success') {
        return 'completed';
      } else if (callStatus === 'failed' || callStatus === 'error') {
        return 'failed';
      } else if (callStatus === 'pending' || callStatus === 'processing') {
        return 'pending';
      }
    }
    return 'unknown';
  } catch (error) {
    console.error('Failed to fetch robocall status:', error);
    return 'unknown';
  }
}
