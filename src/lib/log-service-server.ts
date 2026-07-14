
import prisma from '@/lib/prisma/client';
import type { LogType } from './types';

/**
 * Adds a log entry directly to the PostgreSQL database via Prisma.
 * For use in server-side code only.
 *
 * @param {string} action - A description of the action performed.
 * @param {string} adminName - The name of the admin who performed the action.
 * @param {LogType} type - The category of the log entry.
 */
export async function addLogServer(
  action: string,
  adminName: string,
  type: LogType = 'info'
) {
  if (!adminName) {
    console.warn('Cannot add log: adminName is not provided.');
    return;
  }

  try {
    await prisma.log.create({
      data: {
        action,
        adminName,
        type: type || 'info',
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Error adding log directly to PostgreSQL:', error);
  }
}
