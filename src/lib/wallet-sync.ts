import prisma from '@/lib/prisma/client';
import { traccarClient } from '@/lib/traccar-client';
import { Decimal } from '@prisma/client/runtime/library';
import { addMonths, addYears, format, parseISO } from 'date-fns';

export const WALLET_AUTO_PAY_BY = 'wallet-auto';

type TraccarUser = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  administrator?: boolean;
  manager?: boolean;
  userLimit?: number;
  attributes?: Record<string, unknown>;
};

type TraccarDevice = {
  id: number;
  name: string;
  uniqueId: string;
  expirationTime?: string;
  attributes?: Record<string, unknown>;
};

export type WalletSyncStats = {
  devicesScanned: number;
  devicesLinked: number;
  walletsCreated: number;
  walletsProcessed: number;
  skippedStaff: number;
  skippedNoOwner: number;
  skippedNoFee: number;
  debitsPosted: number;
  creditsPosted: number;
  invoicesAutoPaid: number;
  autoPaidAmount: number;
  errors: string[];
};

export function isStaffTraccarUser(user: TraccarUser | undefined | null): boolean {
  if (!user) return false;
  // Traccar managers are users with a non-zero userLimit (-1 = unlimited).
  const isManager = Boolean(user.manager) || (typeof user.userLimit === 'number' && user.userLimit !== 0);
  return Boolean(user.administrator) || isManager;
}

export function getRenewalFee(attributes: Record<string, unknown> | undefined): number {
  if (!attributes) return 0;
  return (
    Number(
      attributes.renewalFee ||
        attributes.renewal_fee ||
        attributes.renewlFee ||
        attributes.renewal_charge
    ) || 0
  );
}

export function getInstallationDate(device: TraccarDevice): Date | null {
  const attributes = device.attributes || {};
  const raw =
    attributes.installationDate ||
    attributes.InstallationDate ||
    attributes.intallationDate ||
    attributes.instaltionDate ||
    attributes.installation_date ||
    attributes.Installation_Date ||
    attributes.installDate ||
    attributes.InstallDate ||
    attributes['Installation Date'];

  if (!raw) return null;

  let parsed: Date;
  if (typeof raw === 'string') {
    parsed = parseISO(raw);
    if (isNaN(parsed.getTime())) parsed = new Date(raw);
  } else {
    parsed = new Date(raw as string | number | Date);
  }
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getOwnerTraccarId(device: TraccarDevice): number {
  const attributes = device.attributes || {};
  return Number(attributes.uId || attributes.userId || 0) || 0;
}

function subRef(traccarDeviceId: number, periodStart: Date): string {
  return `[SUB:${traccarDeviceId}:${format(periodStart, 'yyyy-MM-dd')}]`;
}

function invRef(invoiceId: string): string {
  return `[INV:${invoiceId}]`;
}

/** Extract dedupe reference tags like [SUB:...] / [INV:...] / [AUTOPAY:...] from a description. */
function extractRefs(description: string): string[] {
  return description.match(/\[(?:SUB|INV|AUTOPAY):[^\]]+\]/g) || [];
}

/**
 * Sync Traccar devices into wallet devices and recalculate every wallet ledger.
 *
 * Rules:
 * - Devices are linked to wallets via the `uId` device attribute (Traccar user id).
 * - Wallets are auto-created only for regular customers. Admin/manager accounts
 *   are skipped unless a wallet was already created manually.
 * - Each device debits its subscription fee per billing period starting from the
 *   installation date, except the first period (covered by the installation payment).
 * - Every paid invoice against the user is credited to the wallet.
 * - Pending invoices are automatically marked as paid from surplus wallet balance.
 */
export async function syncWalletsAndRecalculate(): Promise<WalletSyncStats> {
  const stats: WalletSyncStats = {
    devicesScanned: 0,
    devicesLinked: 0,
    walletsCreated: 0,
    walletsProcessed: 0,
    skippedStaff: 0,
    skippedNoOwner: 0,
    skippedNoFee: 0,
    debitsPosted: 0,
    creditsPosted: 0,
    invoicesAutoPaid: 0,
    autoPaidAmount: 0,
    errors: [],
  };

  const [usersRes, devicesRes, settings] = await Promise.all([
    traccarClient.get<TraccarUser[]>('/users'),
    traccarClient.get<TraccarDevice[]>('/devices'),
    prisma.appSetting.findUnique({ where: { id: 'main' } }),
  ]);

  const traccarUsers = usersRes.data || [];
  const devices = devicesRes.data || [];
  const threshold = settings?.monthlyYearlyThreshold || 2000;
  const usersById = new Map(traccarUsers.map((u) => [u.id, u]));

  stats.devicesScanned = devices.length;

  // 1. Link devices (with subscription fee) to wallets via uId attribute.
  for (const device of devices) {
    try {
      const ownerId = getOwnerTraccarId(device);
      if (!ownerId) {
        stats.skippedNoOwner += 1;
        continue;
      }

      const fee = getRenewalFee(device.attributes);
      if (fee <= 0) {
        stats.skippedNoFee += 1;
        continue;
      }

      let dbUser = await prisma.user.findUnique({ where: { traccarId: ownerId } });
      if (!dbUser) {
        const tUser = usersById.get(ownerId);
        if (isStaffTraccarUser(tUser)) {
          // Admin/manager wallets must be created manually.
          stats.skippedStaff += 1;
          continue;
        }
        if (!tUser) {
          stats.skippedNoOwner += 1;
          continue;
        }
        dbUser = await prisma.user.create({
          data: {
            traccarId: tUser.id,
            name: tUser.name || `Traccar User ${tUser.id}`,
            email: tUser.email || null,
            status: 'active',
          },
        });
        stats.walletsCreated += 1;
        await prisma.log.create({
          data: {
            action: `Wallet auto-created for ${dbUser.name} (wallet #${dbUser.id}, Traccar user ${tUser.id}) during billing sync`,
            adminName: 'Wallet Sync',
            type: 'automation',
          },
        });
      }

      const planType = fee > threshold ? 'yearly' : 'monthly';
      const installationDate = getInstallationDate(device) || new Date();
      const addPeriod = planType === 'yearly' ? addYears : addMonths;
      const now = new Date();

      // Next period boundary after now (period starts at installation + n periods).
      let nextBillingDate = addPeriod(installationDate, 1);
      while (nextBillingDate <= now) {
        nextBillingDate = addPeriod(nextBillingDate, 1);
      }

      const dailyCost = new Decimal(fee).dividedBy(planType === 'yearly' ? 365 : 30);

      await prisma.walletDevice.upsert({
        where: { traccarDeviceId: device.id },
        update: {
          userId: dbUser.id,
          name: device.name,
          planType,
          planPrice: new Decimal(fee),
          dailyCost,
          billingStartDate: installationDate,
          nextBillingDate,
        },
        create: {
          userId: dbUser.id,
          traccarDeviceId: device.id,
          name: device.name,
          planType,
          planPrice: new Decimal(fee),
          dailyCost,
          billingStartDate: installationDate,
          nextBillingDate,
          status: 'active',
        },
      });
      stats.devicesLinked += 1;
    } catch (error: unknown) {
      stats.errors.push(
        `Device ${device.name} (${device.id}): ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  // 2. Recalculate the ledger of every wallet.
  const walletUsers = await prisma.user.findMany({ include: { devices: true } });
  for (const user of walletUsers) {
    try {
      await recalculateWallet(user.id, stats);
      stats.walletsProcessed += 1;
    } catch (error: unknown) {
      stats.errors.push(
        `Wallet ${user.name} (#${user.id}): ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  try {
    await prisma.log.create({
      data: {
        action: `Wallet billing sync completed: ${stats.devicesLinked} devices linked, ${stats.debitsPosted} subscription charges posted, ${stats.creditsPosted} invoice payments credited, ${stats.invoicesAutoPaid} invoices auto-paid (PKR ${stats.autoPaidAmount.toLocaleString()}), ${stats.walletsProcessed} wallets recalculated${stats.errors.length > 0 ? `, ${stats.errors.length} error(s)` : ''}`,
        adminName: 'Wallet Sync',
        type: 'automation',
      },
    });
  } catch (logError) {
    console.error('Failed to write wallet sync log:', logError);
  }

  return stats;
}

/**
 * Rebuild a single wallet ledger:
 * subscription debits per period (first period free) + credits from paid invoices,
 * then recompute the running balance and auto-pay pending invoices from surplus.
 */
export async function recalculateWallet(userId: number, stats?: WalletSyncStats) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { devices: true },
  });
  if (!user) throw new Error(`Wallet user ${userId} not found`);

  const now = new Date();
  const existing = await prisma.transaction.findMany({
    where: { userId },
    select: { description: true },
  });
  const knownRefs = new Set(existing.flatMap((t) => extractRefs(t.description)));

  const newTransactions: Array<{
    userId: number;
    deviceId: number | null;
    type: string;
    amount: Decimal;
    balanceAfter: Decimal;
    description: string;
    createdAt: Date;
  }> = [];

  // Subscription debits per device: every period since installation except the first.
  for (const device of user.devices) {
    if (device.status === 'blocked') continue;

    const addPeriod = device.planType === 'yearly' ? addYears : addMonths;
    const installation = new Date(device.billingStartDate);
    if (isNaN(installation.getTime())) continue;

    // Period 1 (installation → +1 period) is covered by the installation payment.
    let periodStart = addPeriod(installation, 1);
    let periodNumber = 2;

    while (periodStart <= now) {
      const periodEnd = addPeriod(periodStart, 1);
      const ref = subRef(device.traccarDeviceId, periodStart);

      if (!knownRefs.has(ref)) {
        newTransactions.push({
          userId,
          deviceId: device.id,
          type: 'debit',
          amount: new Decimal(device.planPrice),
          balanceAfter: new Decimal(0),
          description: `${ref} Subscription fee — ${device.name} (${device.planType}), period ${periodNumber}: ${format(periodStart, 'dd MMM yyyy')} → ${format(periodEnd, 'dd MMM yyyy')}`,
          createdAt: periodStart,
        });
        knownRefs.add(ref);
        if (stats) stats.debitsPosted += 1;
      }

      periodStart = periodEnd;
      periodNumber += 1;
    }

    await prisma.walletDevice.update({
      where: { id: device.id },
      data: { lastChargedAt: now, nextBillingDate: periodStart },
    });
  }

  // Credits: every paid invoice generated against this Traccar user
  // (auto-paid invoices are excluded — they consume surplus, they don't add money).
  if (user.traccarId) {
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        customerIdentifier: String(user.traccarId),
        status: 'paid',
        NOT: { paidBy: WALLET_AUTO_PAY_BY },
      },
    });

    for (const invoice of paidInvoices) {
      const ref = invRef(invoice.id);
      if (knownRefs.has(ref)) continue;
      newTransactions.push({
        userId,
        deviceId: null,
        type: 'credit',
        amount: new Decimal(invoice.totalAmount || 0),
        balanceAfter: new Decimal(0),
        description: `${ref} Invoice payment — ${invoice.customerName} (${format(new Date(invoice.periodStart), 'dd MMM yyyy')} → ${format(new Date(invoice.periodEnd), 'dd MMM yyyy')})${invoice.paidBy ? `, received by ${invoice.paidBy}` : ''}`,
        createdAt: invoice.paidAt || invoice.updatedAt,
      });
      knownRefs.add(ref);
      if (stats) stats.creditsPosted += 1;
    }
  }

  if (newTransactions.length > 0) {
    await prisma.transaction.createMany({ data: newTransactions });
  }

  // Recompute the running balance across the full history (chronological order).
  const all = await prisma.transaction.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let balance = new Decimal(0);
  const balanceUpdates: Array<{ id: number; balanceAfter: Decimal }> = [];
  for (const tx of all) {
    if (tx.type === 'credit') balance = balance.plus(tx.amount);
    else if (tx.type === 'debit') balance = balance.minus(tx.amount);
    if (!balance.equals(tx.balanceAfter)) {
      balanceUpdates.push({ id: tx.id, balanceAfter: balance });
    }
  }

  const CHUNK = 50;
  for (let i = 0; i < balanceUpdates.length; i += CHUNK) {
    await prisma.$transaction(
      balanceUpdates
        .slice(i, i + CHUNK)
        .map((u) =>
          prisma.transaction.update({ where: { id: u.id }, data: { balanceAfter: u.balanceAfter } })
        )
    );
  }

  await prisma.user.update({ where: { id: userId }, data: { balance } });

  // Auto-pay pending invoices from surplus (oldest first) — can be disabled in Settings.
  const appSettings = await prisma.appSetting.findUnique({ where: { id: 'main' } });
  const autoPayEnabled = appSettings?.walletAutoPayEnabled ?? true;

  if (autoPayEnabled && user.traccarId && balance.greaterThan(0)) {
    let surplus = balance;
    const pending = await prisma.invoice.findMany({
      where: { customerIdentifier: String(user.traccarId), status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    for (const invoice of pending) {
      const total = new Decimal(invoice.totalAmount || 0);
      if (total.lessThanOrEqualTo(0) || surplus.lessThan(total)) continue;

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'paid',
          paidAt: now,
          paidBy: WALLET_AUTO_PAY_BY,
          notes: `${invoice.notes ? `${invoice.notes}\n` : ''}Auto-paid from wallet surplus on ${format(now, 'dd MMM yyyy HH:mm')}.`,
        },
      });

      await prisma.transaction.create({
        data: {
          userId,
          type: 'auto-pay',
          amount: total,
          balanceAfter: balance,
          description: `[AUTOPAY:${invoice.id}] Invoice auto-paid from wallet surplus (PKR ${total.toFixed(2)})`,
        },
      });

      surplus = surplus.minus(total);
      if (stats) {
        stats.invoicesAutoPaid += 1;
        stats.autoPaidAmount += total.toNumber();
      }

      await prisma.log.create({
        data: {
          action: `Invoice #${invoice.id} (${invoice.customerName}, PKR ${total.toNumber().toLocaleString()}) auto-paid from wallet surplus of ${user.name} (wallet #${userId})`,
          adminName: 'Wallet Auto-Pay',
          type: 'automation',
        },
      });
    }
  }

  return { userId, balance: balance.toNumber() };
}
