const EXPIRING_INVOICE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const STARTUP_DELAY_MS = 60 * 1000;

declare global {
  // Prevent duplicate schedulers on dev hot-reload.
  var __expiringInvoiceScheduler: NodeJS.Timeout | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (globalThis.__expiringInvoiceScheduler) return;

  const run = async () => {
    try {
      const { generateInvoicesForExpiringDevices } = await import('@/lib/invoice-service');
      const result = await generateInvoicesForExpiringDevices('Auto Scheduler');
      if (result.invoicesGenerated > 0) {
        console.log(
          `⏰ Pre-expiry invoice scheduler: ${result.invoicesGenerated} invoice(s) generated for ${result.usersChecked} user(s).`
        );
      }
    } catch (error) {
      console.error('Pre-expiry invoice scheduler failed:', error);
    }
  };

  setTimeout(() => void run(), STARTUP_DELAY_MS);
  globalThis.__expiringInvoiceScheduler = setInterval(() => void run(), EXPIRING_INVOICE_INTERVAL_MS);
  console.log('⏰ Pre-expiry invoice scheduler registered (every 6h, 7-day lookahead).');
}
