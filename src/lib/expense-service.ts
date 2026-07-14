
'use client';

import { format } from 'date-fns';
import type { AppSettings } from '@/lib/types';

/**
 * Generates a recurring monthly expense for SIM charges based on the number of active devices.
 * This function is designed to be run once per month. In a real-world app, this would be a server-side cron job.
 * For demonstration, it's called from a client-side hook.
 *
 * @param userId The ID of the user (or system) creating the expense.
 * @param deviceCount The total number of active devices.
 * @param settings The application settings containing the SIM cost.
 */
export async function generateSimExpenses(
  userId: string,
  deviceCount: number,
  settings: AppSettings
) {
  if (deviceCount === 0) {
    console.log('No devices found. Skipping SIM expense generation.');
    return;
  }

  const today = new Date();
  const monthName = format(today, 'MMMM yyyy');
  const monthId = format(today, 'yyyy-MM'); // e.g., '2024-07'
  const simCostPerDevice = settings.simCostPerDevice || 150;
  const totalSimExpense = deviceCount * simCostPerDevice;

  try {
    // Check if an expense for this month has already been created
    const checkRes = await fetch(`/api/expenses?type=sim_charges&monthId=${monthId}`);
    const existingExpenses = await checkRes.json();

    if (Array.isArray(existingExpenses) && existingExpenses.length > 0) {
      console.log(`SIM expense for ${monthName} already exists. Skipping.`);
      return;
    }

    console.log(`Generating SIM expense for ${monthName} for ${deviceCount} devices.`);

    const newExpenseData = {
      title: `Monthly SIM Charges - ${monthName}`,
      amount: totalSimExpense,
      type: 'sim_charges',
      date: today.toISOString(),
      monthId: monthId,
      notes: `${deviceCount} devices @ PKR ${simCostPerDevice}/device.`,
      createdBy: userId,
      status: 'pending',
    };

    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newExpenseData),
    });

    if (!response.ok) {
      throw new Error('Failed to create monthly SIM expense.');
    }

    console.log('Monthly SIM expense created successfully.');

  } catch (error) {
    console.error('Error checking or creating SIM expenses:', error);
  }
}
