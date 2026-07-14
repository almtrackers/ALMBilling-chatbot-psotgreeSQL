
'use client';

import type { LogType } from './types';

/**
 * Adds a log entry to the 'logs' table in PostgreSQL.
 *
 * @param {string} action - A description of the action performed.
 * @param {string} adminName - The name of the admin who performed the action.
 * @param {LogType} type - The category of the log entry.
 */
export async function addLog(
  action: string,
  adminName: string,
  type: LogType = 'info'
) {
  if (!adminName) {
    console.warn('Cannot add log: adminName is not provided.');
    return;
  }
  
  try {
    const response = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, adminName, type }),
    });

    if (!response.ok) {
      console.error('Failed to add log to PostgreSQL.');
    }
  } catch (error) {
    console.error('Error adding log to PostgreSQL:', error);
  }
}
