'use server';

import { predictSubscriptionRenewal } from '@/ai/flows/predict-subscription-renewals';

// Mock data for AI analysis
const mockDeviceUsageData = JSON.stringify({
  deviceId: 'SN12345678',
  dailyActiveHours: [2, 3, 2.5, 4, 3, 1, 0.5, 2, 3.5, 4, 5, 4.5, 3, 2],
  mostUsedFeatures: ['live_tracking', 'history_replay', 'geofence_alerts'],
  lastActivityDate: new Date().toISOString(),
});

const mockInvoicePaymentHistory = JSON.stringify({
  customerId: 'CUST-001',
  payments: [
    { invoiceId: 'INV-2023-01', amount: 4500, status: 'paid', paidOn: '2023-01-15', daysLate: 0 },
    { invoiceId: 'INV-2022-01', amount: 4500, status: 'paid', paidOn: '2022-01-20', daysLate: 5 },
    { invoiceId: 'INV-2021-01', amount: 5000, status: 'paid', paidOn: '2021-01-10', daysLate: 0 },
  ],
  averagePaymentDelay: '1.67 days',
});

export async function getRenewalPrediction() {
  try {
    const prediction = await predictSubscriptionRenewal({
      deviceUsageData: mockDeviceUsageData,
      invoicePaymentHistory: mockInvoicePaymentHistory,
    });
    return { success: true, data: prediction };
  } catch (error) {
    console.error('AI Prediction Error:', error);
    return { success: false, error: 'Failed to get prediction from AI model.' };
  }
}
