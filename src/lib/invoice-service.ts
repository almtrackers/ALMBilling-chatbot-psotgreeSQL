


import prisma from '@/lib/prisma/client';
import { parseISO, subDays, addYears, addMonths, subMonths, subYears, format as formatDate, addDays, isPast, differenceInDays, startOfMonth, startOfYear, format } from 'date-fns';
import { apiClient } from './api';
import type { Invoice, Device, AppSettings, TraccarUser } from './types';
import { addLogServer as addLog } from './log-service-server';
import { triggerInvoiceRobocall, isWithinCallingHours } from './robocall-service';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates the next sequential ID for a new invoice.
 * @returns A promise that resolves to a unique invoice ID.
 */
export async function getNextInvoiceId(): Promise<string> {
  // Use UUID for unique invoice IDs as defined in Prisma schema
  return uuidv4();
}

/**
 * Validate that a candidate is a sensible customer name.
 * - Reject obvious device names, short garbage, numeric-only, and known bad prefixes.
 */
function isValidCustomerName(name?: any, device?: any): boolean {
  if (!name || typeof name !== 'string') return false;
  const s = name.trim();
  
  if (s.length < 3 || s.length > 100) return false; // too short or too long
  
  // blacklist/heuristics
  const blacklist = [
    /^device\s*\d+/i,   // "Device 123"
    /^\d+$/i,           // all digits
    /test/i,
    /unknown/i,
    /^untitled/i,
    /^default/i
  ];
  
  if (blacklist.some(rx => rx.test(s))) return false;
  
  // avoid device.name equality (device names are unreliable)
  if (device && typeof device.name === 'string' && s === device.name.trim()) return false;
  
  // no suspicious punctuation-only names
  if (/^[\W_]+$/.test(s)) return false;
  
  return true;
}

// Fetch a single Traccar user by ID and return their name (string) if present.
async function fetchTraccarUserName(userId: number): Promise<string | null> {
  try {
    const res = await apiClient.get(`/users/${userId}`);
    if (res?.data) {
      // API can return either an object or an array depending on config
      const user = Array.isArray(res.data) ? (res.data as any[])[0] : res.data;
      const candidate = user?.name;
      if (candidate && typeof candidate === 'string') {
        return candidate.trim();
      }
    }
  } catch (e) {
    console.error(`❌ Failed to fetch user ${userId} from Traccar:`, e);
  }
  return null;
}

export async function generateInvoicesFromTraccar(
  adminName: string,
  force: boolean = false
): Promise<void> {
  const today = new Date();
  const isFirstOfMonth = today.getDate() === 1 || force;

  if (!isFirstOfMonth && !force) {
    console.log("📅 Automated invoice generation only runs on the 1st of the month.");
    return;
  }

  try {
    const settings = await prisma.appSetting.findUnique({
      where: { id: 'main' }
    });
    if (!settings) throw new Error("Application settings are not configured.");

    const devicesResponse = await apiClient.get<Device[]>('/devices');
    if (devicesResponse.status !== 200) throw new Error('Failed to fetch devices from server.');
    const allDevices = devicesResponse.data;

    // Group devices by billing user ID
    const userDevicesMap = new Map<number, Device[]>();
    
    for (const device of allDevices) {
        // Skip device if it has an active extension
        if (device.attributes.EXT && Number(device.attributes.EXT) > 0) {
            console.log(`Skipping device ${device.name} due to active extension (EXT=${device.attributes.EXT}).`);
            continue;
        }

        const renewalFee = Number(
          device.attributes?.renewalFee || 
          device.attributes?.renewal_fee || 
          device.attributes?.renewlFee ||
          device.attributes?.renewal_charge
        ) || 0;
        
        if (renewalFee === 0) continue;

        let billingUserId: number | null = null;
        try {
            // Optimization: check attributes first before API call
            billingUserId = Number(device.attributes?.uId || device.attributes?.userId);
            
            if (!billingUserId) {
                const usersRes = await apiClient.get<any[]>(`/users?deviceId=${device.id}`);
                if (usersRes.status === 200 && usersRes.data.length > 0) {
                    billingUserId = usersRes.data[0].id;
                }
            }
        } catch (err) {
            billingUserId = Number(device.attributes?.uId || device.attributes?.userId);
        }

        if (!billingUserId) {
            console.warn(`⚠️ No owner found for device ${device.name} (${device.id}). Skipping.`);
            continue;
        }

        if (!userDevicesMap.has(billingUserId)) {
            userDevicesMap.set(billingUserId, []);
        }
        userDevicesMap.get(billingUserId)!.push(device);
    }

    let invoicesGeneratedCount = 0;
    let usersProcessedCount = 0;

    // Process each user's devices in bulk
    for (const [userId, devices] of userDevicesMap.entries()) {
        try {
            const result = await createBulkInvoiceForUser(userId, adminName, devices);
            if (result.invoiceId) {
                invoicesGeneratedCount++;
                usersProcessedCount++;
            }
        } catch (err: any) {
            console.error(`❌ Failed to generate bulk invoice for userId ${userId}:`, err.message || err);
        }
    }

    if (invoicesGeneratedCount > 0) {
      await addLog(`Automated invoice generation complete. Created ${invoicesGeneratedCount} bulk invoices for ${usersProcessedCount} users.`, adminName, 'automation');
    }

  } catch (err: any) {
    if (err.response) {
      console.error('Server API Error:', err.response.data);
    }
    console.error('🚨 Invoice generation failed:', err.message || err);
  }
}


/** Resolve a device's current expiry from attributes / expirationTime. */
function getDeviceExpiryDate(device: Device): Date | null {
  const raw =
    device.attributes?.expiryDate ||
    (device.attributes as Record<string, unknown> | undefined)?.renewalDate ||
    (device.attributes as Record<string, unknown> | undefined)?.renewal_date ||
    device.expirationTime;
  if (!raw) return null;
  let parsed = typeof raw === 'string' ? parseISO(raw) : new Date(raw as string | number | Date);
  if (isNaN(parsed.getTime())) parsed = new Date(String(raw));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Generate invoices for devices whose subscription expires within `lookaheadDays`
 * (default 7) — runs any day, unlike the monthly bulk generation. Users whose
 * upcoming period is already covered by a pending invoice are skipped, so this
 * is safe to run repeatedly (e.g. from a scheduler).
 */
export async function generateInvoicesForExpiringDevices(
  adminName: string,
  lookaheadDays = 7
): Promise<{ usersChecked: number; invoicesGenerated: number; devicesExpiring: number; details: string[] }> {
  const now = new Date();
  const lookahead = addDays(now, lookaheadDays);
  const details: string[] = [];

  const devicesResponse = await apiClient.get<Device[]>('/devices');
  if (devicesResponse.status !== 200) throw new Error('Failed to fetch devices from server.');
  const allDevices = devicesResponse.data;

  const userDevicesMap = new Map<number, Device[]>();
  const expiringByUser = new Map<number, { device: Device; expiry: Date }[]>();

  for (const device of allDevices) {
    if (device.attributes?.EXT && Number(device.attributes.EXT) > 0) continue;

    const renewalFee = Number(
      device.attributes?.renewalFee ||
      device.attributes?.renewal_fee ||
      device.attributes?.renewlFee ||
      device.attributes?.renewal_charge
    ) || 0;
    if (renewalFee === 0) continue;

    const billingUserId = Number(device.attributes?.uId || device.attributes?.userId) || 0;
    if (!billingUserId) continue;

    if (!userDevicesMap.has(billingUserId)) userDevicesMap.set(billingUserId, []);
    userDevicesMap.get(billingUserId)!.push(device);

    const expiry = getDeviceExpiryDate(device);
    if (!expiry || expiry > lookahead) continue;

    if (!expiringByUser.has(billingUserId)) expiringByUser.set(billingUserId, []);
    expiringByUser.get(billingUserId)!.push({ device, expiry });
  }

  let invoicesGenerated = 0;
  let devicesExpiring = 0;

  for (const [userId, expiring] of expiringByUser.entries()) {
    devicesExpiring += expiring.length;
    try {
      const earliestExpiry = expiring.reduce(
        (min, item) => (item.expiry < min ? item.expiry : min),
        expiring[0].expiry
      );

      // Skip when any invoice (pending or paid) already covers the upcoming period.
      const coveringInvoices = await prisma.invoice.findMany({
        where: { customerIdentifier: String(userId), status: { in: ['pending', 'paid'] } },
        select: { periodEnd: true },
      });
      const alreadyCovered = coveringInvoices.some(
        (inv) => inv.periodEnd && new Date(inv.periodEnd) >= earliestExpiry
      );
      if (alreadyCovered) continue;

      const result = await createBulkInvoiceForUser(userId, adminName, userDevicesMap.get(userId));
      if (result.invoiceId) {
        invoicesGenerated += 1;
        const names = expiring.map((item) => item.device.name).join(', ');
        const msg = `Pre-expiry invoice ${result.invoiceId} created for ${result.customerName} (uId ${userId}) — expiring device(s): ${names}`;
        details.push(msg);
        await addLog(msg, adminName, 'automation');
      }
    } catch (err: any) {
      const msg = `Failed pre-expiry invoice for uId ${userId}: ${err?.message || err}`;
      console.error(`❌ ${msg}`);
      details.push(msg);
    }
  }

  if (invoicesGenerated > 0) {
    await addLog(
      `Pre-expiry invoice run complete: ${invoicesGenerated} invoice(s) generated for ${expiringByUser.size} user(s) with devices expiring within ${lookaheadDays} days.`,
      adminName,
      'automation'
    );
  }

  return { usersChecked: expiringByUser.size, invoicesGenerated, devicesExpiring, details };
}

export async function createBulkInvoiceForUser(
    userId: number,
    adminName: string,
    devicesToProcess?: Device[]
): Promise<{ invoiceId: string | null, devicesInvoiced: number, customerName: string }> {
    const settings = await prisma.appSetting.findUnique({
        where: { id: 'main' }
    });
    if (!settings) throw new Error('Application settings are not configured.');

    let customerName = 'Unknown User';
    const fetchedName = await fetchTraccarUserName(userId);
    if (fetchedName && isValidCustomerName(fetchedName)) {
      customerName = fetchedName;
      console.log(`✅ Fetched customer name for userId ${userId}: "${customerName}"`);
    } else if (fetchedName) {
      console.warn(`⚠️ Traccar user name for userId ${userId} invalid: "${fetchedName}". Will require manual review.`);
      customerName = 'REVIEW_REQUIRED';
    } else {
      console.warn(`⚠️ User with ID ${userId} not found in Traccar API response`);
    }

    let devicesToInvoice: Device[] = [];
    
    if (devicesToProcess) {
        devicesToInvoice = devicesToProcess;
    } else {
        // Fetch all devices and filter by uId or userId if not provided
        const response = await apiClient.get<Device[]>('/devices');
        if (response.status !== 200) throw new Error('Could not fetch devices for the user.');
        devicesToInvoice = response.data.filter(d => 
          d.attributes && (String(d.attributes.uId) === String(userId) || String(d.attributes.userId) === String(userId))
        );
    }

    if (devicesToInvoice.length === 0) return { invoiceId: null, devicesInvoiced: 0, customerName };
    
    // 1. Fetch all previous invoices for this user and their devices to calculate total paid
    const userInvoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { customerIdentifier: String(userId) },
                ...devicesToInvoice.map(d => ({
                    deviceIds: {
                        contains: String(d.id)
                    }
                }))
            ]
        }
    });

    let totalPaidAmount = 0;
    const pendingInvoices: any[] = [];
    let latestPaidPeriodEnd: Date | null = null;

    userInvoices.forEach(inv => {
        if (inv.status === 'paid') {
            totalPaidAmount += (inv.totalAmount || 0);
            
            if (inv.periodEnd) {
              const pEnd = new Date(inv.periodEnd);
              if (!latestPaidPeriodEnd || pEnd.getTime() > latestPaidPeriodEnd.getTime()) {
                latestPaidPeriodEnd = pEnd;
              }
            }
        } else if (inv.status === 'pending') {
            pendingInvoices.push(inv);
        }
    });

    let totalExpectedAmount = 0;
    const now = new Date();
    let earliestPeriodStart: Date | null = null;
    let latestPeriodEnd: Date | null = null;

    console.log(`📊 Recalculating balance for ${customerName} (uId: ${userId}). Total Paid found: ${totalPaidAmount}`);
    await addLog(`Recalculating balance for ${customerName} (uId: ${userId}). Total Paid found: ${totalPaidAmount}`, adminName, 'automation');

    // 2. Calculate cumulative expected amount from installation date for each device
    for (const device of devicesToInvoice) {
        const renewalFee = Number(
          device.attributes?.renewalFee || 
          device.attributes?.renewal_fee || 
          device.attributes?.renewlFee ||
          device.attributes?.renewal_charge
        ) || 0;
        
        const threshold = settings.monthlyYearlyThreshold || 2000;
        const periodType = renewalFee > threshold ? 'yearly' : 'monthly';

        // Installation date fallbacks
        const installationDateValue =
          device.attributes?.installationDate ||
          device.attributes?.InstallationDate ||
          device.attributes?.intallationDate ||
          device.attributes?.instaltionDate ||
          device.attributes?.installation_date ||
          device.attributes?.Installation_Date ||
          device.attributes?.installDate ||
          device.attributes?.InstallDate ||
          device.attributes?.["Installation Date"];

        const currentBillingDateValue = 
          device.attributes?.expiryDate ||
          device.attributes?.renewalDate ||
          device.attributes?.renewal_date ||
          device.attributes?.renewlDate ||
          device.expirationTime;

        if (installationDateValue && renewalFee > 0) {
            let installationDate: Date;
            if (typeof installationDateValue === 'string') {
                installationDate = parseISO(installationDateValue);
                if (isNaN(installationDate.getTime())) installationDate = new Date(installationDateValue);
            } else {
                installationDate = new Date(installationDateValue);
            }

            let billingEndDate = now;
            if (currentBillingDateValue) {
                const parsedEnd = typeof currentBillingDateValue === 'string' ? parseISO(currentBillingDateValue) : new Date(currentBillingDateValue);
                if (!isNaN(parsedEnd.getTime())) {
                    billingEndDate = parsedEnd;
                }
            }

            // Advance to the current/next future expiration date
            // Trigger rollover 7 days before expiry
            const lookaheadDate = addDays(now, 7);
            while (lookaheadDate >= billingEndDate) {
                if (periodType === 'yearly') {
                  const nextYear = addYears(billingEndDate, 1);
                  billingEndDate = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59);
                } else {
                  const nextMonth = addMonths(billingEndDate, 1);
                  billingEndDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
                }
            }

            if (!isNaN(installationDate.getTime())) {
                if (!earliestPeriodStart || installationDate.getTime() < earliestPeriodStart.getTime()) earliestPeriodStart = installationDate;
                if (!latestPeriodEnd || billingEndDate.getTime() > latestPeriodEnd.getTime()) latestPeriodEnd = billingEndDate;

                let periodStart = installationDate;
                
                // Skip the first period (exemption)
                periodStart = periodType === 'yearly' ? addYears(periodStart, 1) : addMonths(periodStart, 1);
                
                let deviceExpected = 0;
                let periodsCharged = 0;
                // Calculate all periods from after the first period to billing end date
                while (periodStart < billingEndDate) {
                    const periodEnd = periodType === 'yearly' ? addYears(periodStart, 1) : addMonths(periodStart, 1);
                    
                    const periodCost = renewalFee + (Number(device.attributes?.simCharges) || 0) + (Number(device.attributes?.otherCharges) || 0) - (Number(device.attributes?.discount) || 0);
                    deviceExpected += periodCost;
                    periodsCharged++;
                    
                    periodStart = periodEnd;
                }
                totalExpectedAmount += deviceExpected;
                const logMsg = `   - Device ${device.name}: Installation ${formatDate(installationDate, 'PP')}, Billing End ${formatDate(billingEndDate, 'PP')}, ${periodsCharged} periods charged, Expected: ${deviceExpected}`;
                console.log(logMsg);
                await addLog(logMsg, adminName, 'automation');
            }
        } else if (renewalFee > 0 && (device.attributes?.expiryDate || device.expirationTime)) {
            // Fallback for devices without installation date: just charge current period
            let periodEnd = parseISO(device.attributes?.expiryDate || device.expirationTime);
            while (isPast(periodEnd)) {
                if (periodType === 'yearly') {
                  const nextYear = addYears(periodEnd, 1);
                  periodEnd = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59);
                } else {
                  const nextMonth = addMonths(periodEnd, 1);
                  periodEnd = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
                }
            }
            const periodStart = periodType === 'yearly' ? subYears(periodEnd, 1) : subMonths(periodEnd, 1);
            
            const periodCost = renewalFee + (Number(device.attributes?.simCharges) || 0) + (Number(device.attributes?.otherCharges) || 0) - (Number(device.attributes?.discount) || 0);
            totalExpectedAmount += periodCost;

            if (!earliestPeriodStart || periodStart < earliestPeriodStart) earliestPeriodStart = periodStart;
            if (!latestPeriodEnd || periodEnd > latestPeriodEnd) latestPeriodEnd = periodEnd;
            const logMsg = `   - Device ${device.name} (No Install Date): Charging current period ${formatDate(periodStart, 'PP')} to ${formatDate(periodEnd, 'PP')}, Cost: ${periodCost}`;
            console.log(logMsg);
            await addLog(logMsg, adminName, 'automation');
        }
    }

    const finalTotal = totalExpectedAmount - totalPaidAmount;
    
    if (finalTotal <= 0) {
        const logMsg = `✅ No outstanding balance for ${customerName}. Total Expected: ${totalExpectedAmount}, Total Paid: ${totalPaidAmount}`;
        console.log(logMsg);
        await addLog(logMsg, adminName, 'automation');
        return { invoiceId: null, devicesInvoiced: 0, customerName };
    }

    const finalLogMsg = `📊 Final balance for ${customerName}: ${finalTotal} (Expected: ${totalExpectedAmount} - Paid: ${totalPaidAmount})`;
    console.log(finalLogMsg);
    await addLog(finalLogMsg, adminName, 'automation');

    // Adjust periodStart to be after the latest paid period to avoid confusing overlaps
    const adjustedPeriodStart = (latestPaidPeriodEnd && earliestPeriodStart && latestPaidPeriodEnd.getTime() > earliestPeriodStart.getTime()) 
        ? latestPaidPeriodEnd 
        : earliestPeriodStart;

    // 3. Mark all relevant pending invoices as rolled-over
    const rolloverPromises = pendingInvoices
        .filter(inv => {
            const invDeviceIds = JSON.parse(inv.deviceIds || '[]');
            return devicesToInvoice.some(d => invDeviceIds.includes(d.id));
        })
        .map(inv => {
            addLog(`Rolled over balance from pending invoice #${inv.id} (Amount: ${inv.totalAmount}) into new cumulative invoice`, adminName, 'automation');
            return prisma.invoice.update({
                where: { id: inv.id },
                data: { status: "rolled-over" }
            });
        });
    
    const newInvoiceId = await getNextInvoiceId();
    
    // Validate customer name before creating invoice
    const requiresReview = !isValidCustomerName(customerName);
    if (requiresReview) {
      if (customerName === 'REVIEW_REQUIRED') {
        console.warn(`⚠️ Invoice ${newInvoiceId} marked for review due to invalid customer name`);
      } else {
        console.warn(`⚠️ Invoice ${newInvoiceId} will be marked for review: invalid customer name "${customerName}"`);
        customerName = 'REVIEW_REQUIRED';
      }
    }
    
    // Log the customer name being saved for debugging
    console.log(`📝 Creating bulk invoice ${newInvoiceId} with customerName: "${customerName}" (for userId: ${userId})${requiresReview ? ' [REVIEW REQUIRED]' : ''}`);
    
    // Determine the overall duration type for the invoice (default to monthly)
    const overallDurationType = devicesToInvoice.some(d => {
      const renewalFee = Number(d.attributes?.renewalFee || d.attributes?.renewal_fee || 0);
      const threshold = settings.monthlyYearlyThreshold || 2000;
      return renewalFee > threshold;
    }) ? 'yearly' : 'monthly';

    // Calculate due date and expiry date based on grace period logic
    const today = new Date();
    const dueDate = startOfMonth(today);
    let expiryDate: Date;
    if (overallDurationType === 'monthly') {
      const nextMonth = addMonths(today, 1);
      expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
    } else {
      const nextYear = addYears(today, 1);
      expiryDate = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59); // Feb 15th
    }

    await prisma.$transaction([
        ...rolloverPromises,
        prisma.invoice.create({
            data: {
                id: newInvoiceId,
                deviceIds: JSON.stringify(devicesToInvoice.map(d => d.id)),
                customerIdentifier: String(userId),
                customerName: customerName,
                totalAmount: finalTotal,
                baseAmount: finalTotal,
                periodStart: adjustedPeriodStart!,
                periodEnd: latestPeriodEnd!,
                status: 'pending',
                notes: `Cumulative bill. Total Expected: ${totalExpectedAmount.toLocaleString()}, Total Paid: ${totalPaidAmount.toLocaleString()}.`,
                paidBy: '',
                createdAt: new Date(),
            }
        })
    ]);
    
    return { invoiceId: newInvoiceId, devicesInvoiced: devicesToInvoice.length, customerName };
}


// Create invoice in Prisma
export async function createInvoiceFromTraccarDevice(
  device: any,
  periodStart: Date,
  periodEnd: Date,
  baseAmount: number,
  discount: number,
  simCharges: number,
  otherCharges: number,
  subscriptionType: 'renewal' | 'firstYear',
  generationType: 'auto' | 'manual',
  durationType: 'monthly' | 'yearly',
  billingUserId?: number,
  requiresUserSelection: boolean = false
): Promise<string | null> {
  
  const existingInvoice = await prisma.invoice.findFirst({
    where: {
      deviceIds: {
        contains: String(device.id)
      },
      periodStart: periodStart,
      periodEnd: periodEnd,
      status: 'pending'
    }
  });
  
  if (existingInvoice) {
    console.log(`🚫 A pending invoice already exists for ${device.name} for period ${format(periodStart, 'PP')}. Skipping.`);
    return null;
  }

  const newInvoiceId = await getNextInvoiceId();
  const totalAmount = baseAmount + simCharges + otherCharges - discount;

  // --- robust customer name resolution ---
  let customerName = 'Unknown User';
  const ownerId = billingUserId || device.attributes?.uId;

  // Try Traccar user name first
  if (ownerId) {
    const fetchedName = await fetchTraccarUserName(ownerId);
    if (fetchedName && isValidCustomerName(fetchedName, device)) {
      customerName = fetchedName;
    } else if (fetchedName) {
      console.warn(`⚠️ Traccar user name for userId ${ownerId} is invalid: "${fetchedName}"`);
    } else {
      console.warn(`⚠️ User with ID ${ownerId} not found in Traccar. Skipping name fallback to device.name.`);
    }
  }

  // Second fallback: try attributes.phoneRobocall or phone (but not device.name)
  if (!isValidCustomerName(customerName)) {
    const phoneCandidate = device.attributes?.phoneRobocall || device.phone;
    if (phoneCandidate && typeof phoneCandidate === 'string') {
      // Use a readable fallback like "Phone: +92xxxx" for customerIdentifier
      customerName = `Phone: ${phoneCandidate.trim()}`;
      console.warn(`ℹ️ Using phone fallback for device ${device.id} as customerIdentifier: ${customerName}`);
    }
  }

  // If still invalid, abort to prevent saving bad data
  if (!isValidCustomerName(customerName)) {
    // Important: do not accept device.name as a valid customerIdentifier
    console.error(`🚫 Aborting invoice creation for device ${device.id}: no valid customer name resolved.`);
    throw new Error(`Cannot create invoice for device ${device.id}: no valid customer name. Please assign an owner to the device.`);
  }

  // Log the customer name being saved for debugging
  console.log(`📝 Creating invoice ${newInvoiceId} with customerName: "${customerName}" (from uId: ${ownerId || 'none'})`);

  // Calculate due date and expiry date based on grace period logic
  const today = new Date();
  const dueDate = startOfMonth(today);
  let expiryDate: Date;
  if (durationType === 'monthly') {
    const nextMonth = addMonths(today, 1);
    expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20, 23, 59, 59);
  } else {
    const nextYear = addYears(today, 1);
    expiryDate = new Date(nextYear.getFullYear(), 1, 15, 23, 59, 59); // Feb 15th
  }

  try {
    const invoice = await prisma.invoice.create({
      data: {
        id: newInvoiceId,
        deviceIds: JSON.stringify([device.id]),
        customerIdentifier: ownerId ? String(ownerId) : undefined, // store uId as identifier
        customerName: customerName, // Store actual customer name
        subscriptionType: subscriptionType,
        baseAmount: baseAmount,
        simCharges: simCharges,
        otherCharges: otherCharges,
        discount: discount,
        totalAmount: totalAmount,
        periodStart: periodStart,
        periodEnd: periodEnd,
        dueDate: dueDate,
        expiryDate: expiryDate,
        status: 'pending',
        paidAt: null,
        paidBy: '',
        createdAt: new Date(),
        durationType: durationType,
        requiresReview: requiresUserSelection
      }
    });
    console.log(`✅ Invoice ${newInvoiceId} created for ${device.name}`);
    return invoice.id;
  } catch (err: any) {
    console.error(`🚨 Failed to create invoice for ${device.name}:`, err.message || err);
    return null;
  }
}


/**
 * Simple logic for invoice creation based on installation date and cumulative billing.
 * Calculates total bill from installation_date to current date and subtracts paid amount.
 */
export async function createInvoiceFromInstallationDate(
  userId: number,
  adminName: string
): Promise<{ invoiceId: string | null; amount: number; customerName: string }> {
  console.log(`🔍 Generating cumulative invoices for userId ${userId} based on installation date...`);

  try {
    const settings = await prisma.appSetting.findUnique({
        where: { id: 'main' }
    });
    if (!settings) throw new Error("Application settings are not configured.");
    const threshold = settings.monthlyYearlyThreshold || 2000;

    const devicesResponse = await apiClient.get<Device[]>('/devices');
    if (devicesResponse.status !== 200) throw new Error('Failed to fetch devices.');
    
    const userDevices = devicesResponse.data.filter(d => 
      d.attributes && (String(d.attributes.uId) === String(userId) || String(d.attributes.userId) === String(userId))
    );

    if (userDevices.length === 0) {
      console.warn(`⚠️ No devices found for userId ${userId}`);
      return { invoiceId: null, amount: 0, customerName: 'Unknown' };
    }

    let customerName = 'Unknown User';
    const fetchedName = await fetchTraccarUserName(userId);
    if (fetchedName && isValidCustomerName(fetchedName)) {
      customerName = fetchedName;
    }

    let invoicesGeneratedCount = 0;
    let totalAmount = 0;
    const today = new Date();

    for (const device of userDevices) {
       const renewalFee = Number(
         device.attributes?.renewalFee || 
         device.attributes?.renewal_fee || 
         device.attributes?.renewlFee || 
         device.attributes?.renewal_charge
       ) || 0;
       
       const installationDateValue =
         device.attributes?.installationDate ||
         device.attributes?.InstallationDate ||
         device.attributes?.intallationDate || 
         device.attributes?.instaltionDate || 
         device.attributes?.installation_date ||
         device.attributes?.Installation_Date ||
         device.attributes?.installDate ||
         device.attributes?.InstallDate ||
         device.attributes?.["Installation Date"];

       if (installationDateValue && renewalFee > 0) {
         let installationDate: Date;
         if (typeof installationDateValue === 'string') {
           installationDate = parseISO(installationDateValue);
           if (isNaN(installationDate.getTime())) installationDate = new Date(installationDateValue);
         } else {
           installationDate = new Date(installationDateValue);
         }

         const periodType = renewalFee > threshold ? 'yearly' : 'monthly';
         
         if (!isNaN(installationDate.getTime())) {
           let periodStart = installationDate;
           // Skip the first period (exemption)
           periodStart = periodType === 'yearly' ? addYears(periodStart, 1) : addMonths(periodStart, 1);
           
           // Normalize periodStart to 1st
           if (periodType === 'monthly') {
               periodStart = startOfMonth(periodStart);
           } else {
               periodStart = startOfYear(periodStart);
           }

           const billingEndDate = today;
           
           while (periodStart < billingEndDate) {
             const periodEnd = periodType === 'yearly' ? addYears(periodStart, 1) : addMonths(periodStart, 1);
             
             // Check if invoice already exists in Prisma
             const existingInvoice = await prisma.invoice.findFirst({
                 where: {
                     deviceIds: {
                         contains: String(device.id)
                     },
                     periodStart: periodStart,
                     periodEnd: periodEnd
                 }
             });

             if (!existingInvoice) {
                const amount = renewalFee + (Number(device.attributes?.simCharges) || 0) + (Number(device.attributes?.otherCharges) || 0) - (Number(device.attributes?.discount) || 0);
                
                await createInvoiceFromTraccarDevice(
                    device,
                    periodStart,
                    periodEnd,
                    renewalFee,
                    Number(device.attributes?.discount) || 0,
                    Number(device.attributes?.simCharges) || 0,
                    Number(device.attributes?.otherCharges) || 0,
                    'renewal',
                    'manual',
                    periodType,
                    userId
                );
                invoicesGeneratedCount++;
                totalAmount += amount;
             }
             periodStart = periodEnd;
           }
         }
       }
    }

    if (invoicesGeneratedCount > 0) {
        await addLog(`Created ${invoicesGeneratedCount} separate invoices for ${customerName} (Total: ${totalAmount})`, adminName, 'create');
    }

    return { invoiceId: 'MULTIPLE', amount: totalAmount, customerName };

  } catch (error: any) {
    console.error('🚨 Failed to create invoices:', error.message || error);
    throw error;
  }
}


/**
 * Extends billing expiry of a device via attributes while keeping Traccar expiry unlimited.
 * @param deviceId The ID of the device to update.
 * @param targetExpiry The end date of the billing period that was just paid.
 * @param durationType The type of subscription which determines the extension period ('monthly' or 'yearly').
 * @param daysToAdd An optional specific number of days to add (e.g. for temporary extensions).
 */
export async function extendTraccarDeviceExpiry(
  deviceId: number,
  targetExpiry: Date,
  durationType: 'monthly' | 'yearly',
  daysToAdd?: number
) {
  let newExpiryDate = targetExpiry;
  
  if (daysToAdd !== undefined) {
    newExpiryDate = addDays(targetExpiry, daysToAdd);
  }

  try {
    const deviceRes = await apiClient.get<Device[]>(`/devices?id=${deviceId}`);
    if (deviceRes.status !== 200 || deviceRes.data.length === 0) {
      throw new Error(`Could not fetch device with ID ${deviceId} from server.`);
    }
    const deviceToUpdate = deviceRes.data[0];
    const ownerId = deviceToUpdate.attributes?.uId || deviceToUpdate.attributes?.userId;
    
    let isOwnerAdmin = false;
    if (ownerId) {
        try {
            const userRes = await apiClient.get<any[]>(`/users?id=${ownerId}`);
            if (userRes.status === 200 && userRes.data.length > 0) {
                isOwnerAdmin = userRes.data[0].administrator === true;
            }
        } catch (err) {
            console.warn(`Could not verify admin status for userId ${ownerId}`, err);
        }
    }

    // For both users and admins, ensure expiry is on the correct date based on period
    const expDay = durationType === 'monthly' ? 20 : 15;
    const expMonth = durationType === 'monthly' ? newExpiryDate.getMonth() : 1; // 1 is February
    newExpiryDate = new Date(newExpiryDate.getFullYear(), expMonth, expDay, 23, 59, 59);

    // Remove position if it exists
    const { position: _, ...payload } = deviceToUpdate as any;
    
    const attributes: Record<string, any> = {
        ...deviceToUpdate.attributes,
        EXT: 0, // Reset extension attribute on payment
        lastPaidOn: new Date().toISOString(),
        expdays: expDay,
        expiryDate: newExpiryDate.toISOString(),
    };

    const finalPayload = {
        ...payload,
        expirationTime: newExpiryDate.toISOString(), // Use actual expiry instead of unlimited
        attributes: attributes
    };
    
    console.log('Updating device:', deviceId, finalPayload);
    const response = await apiClient.put(`/devices/${deviceId}`, finalPayload);

    if (response.status !== 200) {
      throw new Error(`Server API responded with status ${response.status}`);
    }
   console.log(`✅ Device ${deviceId} expiry extended to ${newExpiryDate.toISOString()}`);
  } catch (error: any) {
    console.error(`🚨 Failed to extend expiry for device ${deviceId}:`, error.message);
    console.error(error.response?.data);
    throw error;
  }
}

/**
 * Grants a temporary extension for an invoice and its associated devices.
 * @param invoiceId The ID of the invoice.
 * @param extensionDays Number of days to extend.
 * @param devices List of all devices to find and update associated devices.
 */
export async function grantInvoiceExtension(
  invoiceId: string,
  extensionDays: number,
  devices: Device[]
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) throw new Error('Invoice not found');

  const deviceIds = JSON.parse(invoice.deviceIds) as number[];
  const newExpiryDate = addDays(invoice.periodEnd, extensionDays);

  // Update all associated devices on Traccar server
  for (const deviceId of deviceIds) {
    const deviceToUpdate = devices.find(d => d.id === deviceId);
    if (deviceToUpdate) {
      const { position, ...payload } = {
        ...deviceToUpdate,
        id: deviceId,
        expirationTime: newExpiryDate.toISOString(),
        attributes: {
          ...deviceToUpdate.attributes,
          EXT: extensionDays,
          expiryDate: newExpiryDate.toISOString(),
        }
      } as any;
      
      await apiClient.put(`/devices/${deviceId}`, payload);
    }
  }

  // Update the invoice in Prisma
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      extensionDays: extensionDays,
      extensionGrantedAt: new Date(),
    }
  });

  return { success: true };
}

/**
 * Reverts frontend billing expiry for a device while keeping Traccar expiry unlimited.
 * @param deviceId The ID of the device to update.
 * @param periodEndDate The end date of the billing period that was just marked as pending. This is the date we need to revert to.
 */
export async function reverseTraccarDeviceExpiry(
  deviceId: number,
  periodEndDate: Date,
  durationType?: 'monthly' | 'yearly'
) {
  try {
    const deviceRes = await apiClient.get<Device[]>(`/devices?id=${deviceId}`);
    if (deviceRes.status !== 200 || deviceRes.data.length === 0) {
      throw new Error(`Could not fetch device with ID ${deviceId} from server.`);
    }
    const deviceToUpdate = deviceRes.data[0];

    // Payment moved the expiry forward to the invoice's periodEnd, so undoing a
    // payment must move it BACK one billing period. Setting it to periodEnd
    // again would be a no-op. Without a durationType (extension reversal) we
    // keep the old behavior of restoring the given date directly.
    let originalExpiryDate = periodEndDate;
    if (durationType) {
      const currentRaw =
        deviceToUpdate.attributes?.expiryDate || deviceToUpdate.expirationTime;
      let base = currentRaw ? new Date(String(currentRaw)) : periodEndDate;
      if (isNaN(base.getTime())) base = periodEndDate;
      originalExpiryDate = durationType === 'yearly' ? subYears(base, 1) : subMonths(base, 1);
    }

    // Remove position if it exists (not part of Device type but may be in API response)
    const { position: _, ...deviceData } = deviceToUpdate as any;
    const updatePayload = {
      ...deviceData,
      expirationTime: originalExpiryDate.toISOString(),
      attributes: {
        ...deviceToUpdate.attributes,
        EXT: 0, // also clear extension flag on reversal to allow future invoicing
        expiryDate: originalExpiryDate.toISOString(),
      },
    };

    const response = await apiClient.put(`/devices/${deviceId}`, updatePayload);

    if (response.status !== 200) {
      throw new Error(`Server API responded with status ${response.status}`);
    }
    console.log(`✅ Device ${deviceId} expiry reverted to ${originalExpiryDate.toISOString()}`);
  } catch (error: any) {
    console.error(`🚨 Failed to revert expiry for device ${deviceId}:`, error.message);
    console.error(error.response?.data);
    throw error;
  }
}


// Optional: Trigger Robocall alert before expiry (old implementation - kept for backward compatibility)
async function triggerRobocallReminder(device: any, expiryDate: Date) {
  const expiryStr = expiryDate.toISOString().split('T')[0];
  const phone = device.attributes?.phoneRobocall;

  if (!phone) {
    console.warn(`☎️ No phone number found for ${device.name} using 'phoneRobocall' attribute. Skipping robocall.`);
    return;
  }

  try {
    const res = await fetch('https://robocall.pk/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: phone,
        message: `Dear customer, your tracker for ${device.name} will expire on ${expiryStr}. Please renew your subscription.`,
      }),
    });

    if (res.ok) {
      console.log(`📞 Robocall reminder sent to ${phone}`);
    } else {
      console.warn(`⚠️ Robocall failed for ${device.name}: ${res.statusText}`);
    }
  } catch (err) {
    console.warn(`⚠️ Robocall API error for ${device.name}:`, err);
  }
}

/**
 * Check pending invoices and auto-call customers 1 day before expiry
 * Only calls once per invoice and only during calling hours (1 PM - 8 PM PKT)
 * Skips paid and rolled-over invoices
 */
export async function checkAndAutoCallInvoiceReminders(
  adminName: string
): Promise<void> {
  try {
    // Check if within calling hours
    if (!isWithinCallingHours()) {
      console.log('⏰ Outside calling hours (1 PM - 8 PM PKT). Skipping auto-calls.');
      return;
    }

    const today = new Date();
    
    // Get all pending invoices only (skip paid and rolled-over - these are payment reminders)
    const pendingInvoices = await prisma.invoice.findMany({
      where: {
        status: 'pending',
        autoCallMade: { not: true }
      }
    });
    
    if (pendingInvoices.length === 0) {
      console.log('✅ No pending invoices to check for auto-calls.');
      return;
    }

    // Get all devices
    const devicesResponse = await apiClient.get<Device[]>('/devices');
    if (devicesResponse.status !== 200) {
      throw new Error('Failed to fetch devices from server.');
    }
    const allDevices = devicesResponse.data;
    const deviceMap = new Map(allDevices.map(d => [d.id, d]));

    let callsMade = 0;
    for (const invoice of pendingInvoices) {
      // Check if expiry is exactly 1 day away
      const expiryDate = new Date(invoice.periodEnd);
      const daysUntilExpiry = differenceInDays(expiryDate, today);
      
      if (daysUntilExpiry !== 1) {
        continue; // Not exactly 1 day before expiry
      }

      // Get phone number from first device
      const deviceIds = JSON.parse(invoice.deviceIds || '[]');
      const firstDeviceId = deviceIds[0];
      if (!firstDeviceId) continue;
      
      const device = deviceMap.get(Number(firstDeviceId));
      if (!device) continue;

      const phoneNumber = device.attributes?.phoneRobocall || device.attributes?.phone;
      if (!phoneNumber) {
        console.warn(`⚠️ No phone number found for invoice ${invoice.id}`);
        continue;
      }

      // Make the call (Invoice ID is used as prompt_id/rcId)
      const result = await triggerInvoiceRobocall(
        invoice as any,
        phoneNumber,
        device.name,
        4 // Expiry Alert voice ID
      );

      // Update invoice with call status in Prisma
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          autoCallMade: true,
          autoCallDate: new Date(),
          lastCallPromptId: invoice.id, // Store Invoice ID as prompt_id
          lastCallDate: new Date(),
          lastCallStatus: 'pending', // Initially pending, will be updated from logs
        }
      });

      if (result.success) {
        callsMade++;
        await addLog(
          `Auto-called customer for invoice #${invoice.id} (rcId: ${invoice.id})`,
          adminName,
          'automation'
        );
        console.log(`📞 Auto-call made for invoice ${invoice.id} to ${phoneNumber}`);
      } else {
        await addLog(
          `Failed to auto-call customer for invoice #${invoice.id}: ${result.error}`,
          adminName,
          'automation'
        );
        console.warn(`⚠️ Auto-call failed for invoice ${invoice.id}: ${result.error}`);
      }
    }

    if (callsMade > 0) {
      console.log(`✅ Auto-call reminder complete. ${callsMade} calls made.`);
    }
  } catch (error: any) {
    console.error('🚨 Auto-call reminder check failed:', error.message || error);
    throw error;
  }
}
