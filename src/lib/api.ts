
import axios from 'axios';
import type { Event } from '@/lib/types';
import { subHours, formatISO } from 'date-fns';

export const apiClient = axios.create({
  baseURL: '/api/traccar',
  withCredentials: true,
});

export const localApiClient = axios.create({
  baseURL: '/api',
});


export type SendCommandResponse = {
  success: boolean;
  deviceId: number;
  deviceName: string;
  command: string;
  channel: 'network' | 'sms';
  status: 'sent' | 'queued' | 'failed';
  detail?: string;
  message?: string;
  simNumber?: string | null;
  imsi?: string | null;
};

/**
 * Sends a command to a device. Online devices use the network channel;
 * offline devices use SMS when TRACCAR_SMS_GATEWAY_* is configured in .env.
 */
export async function sendTraccarCommand(
  deviceId: number,
  command: string,
  options?: { channel?: 'auto' | 'network' | 'sms'; smsTo?: string }
): Promise<SendCommandResponse> {
  try {
    const response = await localApiClient.post<SendCommandResponse>('/commands/send', {
      deviceId,
      command,
      channel: options?.channel || 'auto',
      smsTo: options?.smsTo?.trim() || undefined,
    });
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Could not send command to device.');
    }
    return response.data;
  } catch (error: unknown) {
    console.error(`Failed to send command to device ${deviceId}:`, error);
    if (axios.isAxiosError(error) && error.response?.data?.message) {
      throw new Error(String(error.response.data.message));
    }
    if (error instanceof Error) throw error;
    throw new Error('Could not send command to device via server API.');
  }
}

/**
 * Fetches recent events for a specific device from the tracking server API.
 * This now uses a GET request with URL parameters.
 * @param deviceId The ID of the device to fetch events for.
 * @param from The starting timestamp to fetch events from.
 * @returns A promise that resolves to an array of event objects.
 */
export async function getTraccarDeviceEvents(deviceId: number, from?: Date): Promise<Event[]> {
    try {
        const to = new Date();
        // Default to fetching events from the last 24 hours if 'from' is not provided
        const fromDate = from || subHours(to, 24);

        const params = new URLSearchParams({
            deviceId: deviceId.toString(),
            from: fromDate.toISOString(),
            to: to.toISOString(),
        });

        const response = await apiClient.get<Event[]>(`/reports/events?${params.toString()}`);
        return response.data;
    } catch (error: any) {
        console.error(`Failed to fetch events for device ${deviceId}:`, error);
        console.error(error.response?.data);
        throw new Error('Could not fetch device events from server API.');
    }
}

/**
 * Fetches robocall logs from the tracking server API.
 * @param options Options for filtering robocall logs
 * @param options.deviceId Optional device ID to filter by
 * @param options.userId Optional user ID to filter by
 * @param options.rcId Optional rcId (prompt_id) to filter by (e.g., Invoice ID)
 * @param options.status Optional call status filter (e.g., 'completed', 'failed')
 * @param options.from Optional start date for filtering logs
 * @param options.to Optional end date for filtering logs
 * @param options.limit Maximum number of logs to return (default: 5)
 * @returns A promise that resolves to an array of robocall log objects.
 */
export async function getRobocallLogs(options: {
  deviceId?: number;
  userId?: number;
  rcId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    
    if (options.deviceId) {
      params.append('deviceId', options.deviceId.toString());
    }
    if (options.userId) {
      params.append('userId', options.userId.toString());
    }
    if (options.rcId) {
      params.append('rcId', options.rcId);
    }
    if (options.status) {
      params.append('status', options.status);
    }
    if (options.from) {
      params.append('from', options.from.toISOString());
    }
    if (options.to) {
      params.append('to', options.to.toISOString());
    }
    if (options.limit) {
      params.append('limit', options.limit.toString());
    } else {
      params.append('limit', '5');
    }

    const response = await apiClient.get<any[]>(`/robocall-logs?${params.toString()}`);
    return response.data || [];
  } catch (error: any) {
    const status = error.response?.status;
    if (status && status !== 401 && status !== 404 && status !== 502) {
      console.warn(`Failed to fetch robocall logs (${status}):`, error.message);
    }
    return [];
  }
}