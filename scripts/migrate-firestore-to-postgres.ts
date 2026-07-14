/**
 * Migrates Firestore collections to PostgreSQL via Prisma.
 *
 * Usage:
 *   npm run db:migrate-firestore
 *
 * Required env vars:
 *   DATABASE_URL
 *   FIREBASE_PROJECT_ID (optional, defaults to al-muhafiz-trackers)
 *   GOOGLE_APPLICATION_CREDENTIALS (path to Firebase service account JSON)
 *   TRACCAR_USER / TRACCAR_PASS (optional, for seeding registration numbers from Traccar)
 */

import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { PrismaClient, Prisma } from '@prisma/client';
import { normalizePhoneNumber } from '../src/lib/utils';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const prisma = new PrismaClient();

async function getTraccarClient() {
  const { traccarClient } = await import('../src/lib/traccar-client');
  return traccarClient;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds: number }).seconds);
    return Number.isNaN(seconds) ? null : new Date(seconds * 1000);
  }
  return null;
}

function toDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : new Prisma.Decimal(num);
}

function toJsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function resolveCredentialsPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(process.cwd(), 'al-muhafiz-trackers-firebase-adminsdk-fbsvc-c0a34ce1ad.json'),
    path.join(process.cwd(), 'firebase-service-account.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  const rootFiles = fs.readdirSync(process.cwd());
  const autoDetected = rootFiles.find(
    (file) => file.includes('firebase-adminsdk') && file.endsWith('.json')
  );
  if (autoDetected) {
    return path.join(process.cwd(), autoDetected);
  }

  return null;
}

function initFirebase() {
  if (getApps().length > 0) {
    return getFirestore();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || 'al-muhafiz-trackers';
  const credentialsPath = resolveCredentialsPath();
  const inlineCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (inlineCredentials) {
    const serviceAccount = JSON.parse(inlineCredentials);
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
    return getFirestore();
  }

  if (credentialsPath) {
    console.log(`Using Firebase credentials: ${credentialsPath}`);
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
    return getFirestore();
  }

  throw new Error(
    'Firebase credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS in .env.local ' +
      'or place your *-firebase-adminsdk-*.json file in the project root.'
  );
}

async function migrateCollection<T extends Record<string, unknown>>(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  handler: (id: string, data: T) => Promise<void>
) {
  const snapshot = await db.collection(collectionName).get();
  console.log(`Migrating ${collectionName}: ${snapshot.size} documents`);
  for (const doc of snapshot.docs) {
    await handler(doc.id, doc.data() as T);
  }
}

async function migrateSales(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'sales', async (id, data) => {
    await prisma.sale.upsert({
      where: { id },
      update: {},
      create: {
        id,
        customerName: String(data.customerName || ''),
        amount: toDecimal(data.amount) || new Prisma.Decimal(0),
        devicePrice: toDecimal(data.devicePrice),
        currentPeriodCharges: toDecimal(data.currentPeriodCharges),
        date: toDate(data.date) || new Date(),
        vehicleNumber: String(data.vehicleNumber || ''),
        monthId: data.monthId ? String(data.monthId) : null,
        notes: data.notes ? String(data.notes) : null,
        relatedInvoiceId: data.relatedInvoiceId ? String(data.relatedInvoiceId) : null,
        createdBy: String(data.createdBy || 'migration'),
        createdAt: toDate(data.createdAt) || new Date(),
        dealerId: data.dealerId ? String(data.dealerId) : null,
        commission: toDecimal(data.commission),
        trackerId: data.trackerId ? String(data.trackerId) : null,
        imei: data.imei ? String(data.imei) : null,
        harnessId: data.harnessId ? String(data.harnessId) : null,
        relayId: data.relayId ? String(data.relayId) : null,
        micId: data.micId ? String(data.micId) : null,
        sosButtonId: data.sosButtonId ? String(data.sosButtonId) : null,
        simId: data.simId ? String(data.simId) : null,
        simNumber: data.simNumber ? String(data.simNumber) : null,
        imsi: data.imsi ? String(data.imsi) : null,
        phoneRobocall: data.phoneRobocall ? String(data.phoneRobocall) : null,
        contactNumber: data.contactNumber ? String(data.contactNumber) : null,
        notificationIds: toJsonText(data.notificationIds),
        status: String(data.status || 'active'),
        unsubscribedAt: toDate(data.unsubscribedAt),
        unsubscribeReason: data.unsubscribeReason ? String(data.unsubscribeReason) : null,
        renewalFee: toDecimal(data.renewalFee),
        simCharges: toDecimal(data.simCharges),
        discount: toDecimal(data.discount),
      },
    });
  });
}

async function migrateInvoices(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'invoices', async (id, data) => {
    const deviceIds = Array.isArray(data.deviceIds)
      ? JSON.stringify(data.deviceIds)
      : toJsonText(data.deviceIds) || '[]';

    await prisma.invoice.upsert({
      where: { id },
      update: {},
      create: {
        id,
        deviceIds,
        customerIdentifier: String(data.customerIdentifier || ''),
        customerName: String(data.customerName || data.customerIdentifier || ''),
        totalAmount: Number(data.totalAmount || 0),
        baseAmount: Number(data.baseAmount || 0),
        periodStart: toDate(data.periodStart) || new Date(),
        periodEnd: toDate(data.periodEnd) || new Date(),
        status: String(data.status || 'pending'),
        paidAt: toDate(data.paidAt),
        paidBy: data.paidBy ? String(data.paidBy) : null,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date(),
        notes: data.notes ? String(data.notes) : null,
        extensionDays: data.extensionDays ? Number(data.extensionDays) : null,
        extensionGrantedAt: toDate(data.extensionGrantedAt),
        autoCallDate: toDate(data.autoCallDate),
        autoCallMade: Boolean(data.autoCallMade),
        discount: Number(data.discount || 0),
        dueDate: toDate(data.dueDate),
        durationType: data.durationType ? String(data.durationType) : null,
        expiryDate: toDate(data.expiryDate),
        lastCallDate: toDate(data.lastCallDate),
        lastCallPromptId: data.lastCallPromptId ? String(data.lastCallPromptId) : null,
        lastCallStatus: data.lastCallStatus ? String(data.lastCallStatus) : null,
        otherCharges: Number(data.otherCharges || 0),
        previousDues: Number(data.previousDues || 0),
        requiresReview: Boolean(data.requiresReview),
        simCharges: Number(data.simCharges || 0),
        subscriptionType: data.subscriptionType ? String(data.subscriptionType) : null,
      },
    });
  });
}

async function migrateInvoiceItems(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'invoiceItems', async (id, data) => {
    await prisma.invoiceItem.upsert({
      where: { id },
      update: {},
      create: {
        id,
        invoiceId: String(data.invoiceId || ''),
        deviceId: Number(data.deviceId || 0),
        deviceName: String(data.deviceName || ''),
        deviceImei: String(data.deviceImei || ''),
        description: String(data.description || ''),
        baseAmount: data.baseAmount !== undefined ? Number(data.baseAmount) : null,
        simCharges: data.simCharges !== undefined ? Number(data.simCharges) : null,
        otherCharges: data.otherCharges !== undefined ? Number(data.otherCharges) : null,
        discount: data.discount !== undefined ? Number(data.discount) : null,
        totalAmount: Number(data.totalAmount || 0),
        periodStart: toDate(data.periodStart),
        periodEnd: toDate(data.periodEnd),
        createdAt: toDate(data.createdAt) || new Date(),
      },
    });
  });
}

async function migrateExpenses(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'expenses', async (id, data) => {
    await prisma.expense.upsert({
      where: { id },
      update: {},
      create: {
        id,
        inventoryItemId: data.inventoryItemId ? String(data.inventoryItemId) : null,
        title: String(data.title || ''),
        amount: toDecimal(data.amount) || new Prisma.Decimal(0),
        type: String(data.type || ''),
        date: toDate(data.date) || new Date(),
        status: String(data.status || 'pending'),
        monthId: data.monthId ? String(data.monthId) : null,
        notes: data.notes ? String(data.notes) : null,
        createdBy: String(data.createdBy || 'migration'),
        createdAt: toDate(data.createdAt) || new Date(),
        approvedBy: data.approvedBy ? String(data.approvedBy) : null,
        approvedAt: toDate(data.approvedAt),
        isRecurring: Boolean(data.isRecurring),
        recurringFrequency: data.recurringFrequency ? String(data.recurringFrequency) : null,
        personId: data.personId ? String(data.personId) : null,
        dealerId: data.dealerId ? String(data.dealerId) : null,
        transactionType: data.transactionType ? String(data.transactionType) : null,
      },
    });
  });
}

async function migrateInventory(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'inventory', async (id, data) => {
    await prisma.inventoryItem.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: String(data.name || ''),
        type: String(data.type || ''),
        quantity: Number(data.quantity || 0),
        cost: toDecimal(data.cost),
        supplier: data.supplier ? String(data.supplier) : null,
        lastUpdated: toDate(data.lastUpdated) || new Date(),
        imeis: toJsonText(data.imeis),
        sims: toJsonText(data.sims),
      },
    });
  });
}

async function migrateDealers(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'dealers', async (id, data) => {
    await prisma.dealer.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: String(data.name || ''),
        phone: String(data.phone || ''),
        address: String(data.address || ''),
        createdAt: toDate(data.createdAt) || new Date(),
      },
    });
  });
}

async function migrateCompanyVehicles(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'companyVehicles', async (id, data) => {
    await prisma.companyVehicle.upsert({
      where: { id },
      update: {},
      create: {
        id,
        customerName: String(data.customerName || ''),
        date: toDate(data.date) || new Date(),
        vehicleNumber: String(data.vehicleNumber || ''),
        monthId: data.monthId ? String(data.monthId) : null,
        notes: data.notes ? String(data.notes) : null,
        createdBy: String(data.createdBy || 'migration'),
        createdAt: toDate(data.createdAt) || new Date(),
        dealerId: data.dealerId ? String(data.dealerId) : null,
        trackerId: data.trackerId ? String(data.trackerId) : null,
        imei: data.imei ? String(data.imei) : null,
        harnessId: data.harnessId ? String(data.harnessId) : null,
        relayId: data.relayId ? String(data.relayId) : null,
        micId: data.micId ? String(data.micId) : null,
        sosButtonId: data.sosButtonId ? String(data.sosButtonId) : null,
        simId: data.simId ? String(data.simId) : null,
        simNumber: data.simNumber ? String(data.simNumber) : null,
        imsi: data.imsi ? String(data.imsi) : null,
        phoneRobocall: data.phoneRobocall ? String(data.phoneRobocall) : null,
        contactNumber: data.contactNumber ? String(data.contactNumber) : null,
        notificationIds: toJsonText(data.notificationIds),
      },
    });
  });
}

async function migrateLogs(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'logs', async (id, data) => {
    await prisma.log.upsert({
      where: { id },
      update: {},
      create: {
        id,
        action: String(data.action || ''),
        adminName: String(data.adminName || ''),
        type: String(data.type || ''),
        createdAt: toDate(data.createdAt) || new Date(),
      },
    });
  });
}

async function migrateApprovals(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'approvalRequests', async (id, data) => {
    await prisma.approvalRequest.upsert({
      where: { id },
      update: {},
      create: {
        id,
        actionType: String(data.actionType || ''),
        targetId: String(data.targetId || ''),
        payload: toJsonText(data.payload) || '{}',
        status: String(data.status || 'pending'),
        requestedBy: toJsonText(data.requestedBy) || '{}',
        approvals: toJsonText(data.approvals) || '[]',
        rejections: toJsonText(data.rejections),
        requiredApprovals: Number(data.requiredApprovals || 1),
        createdAt: toDate(data.createdAt) || new Date(),
        resolvedAt: toDate(data.resolvedAt),
        resolvedBy: data.resolvedBy ? String(data.resolvedBy) : null,
      },
    });
  });
}

async function migrateCustomCommands(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'customCommands', async (id, data) => {
    await prisma.customCommand.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: String(data.name || ''),
        command: String(data.command || ''),
        createdAt: toDate(data.createdAt) || new Date(),
      },
    });
  });
}

async function migrateAppSettings(db: FirebaseFirestore.Firestore) {
  const doc = await db.collection('appSettings').doc('main').get();
  if (!doc.exists) return;
  const data = doc.data() || {};
  await prisma.appSetting.upsert({
    where: { id: 'main' },
    update: {},
    create: {
      id: 'main',
      theme: String(data.theme || 'light'),
      invoiceDaysMonthly: Number(data.invoiceDaysMonthly || 3),
      invoiceDaysYearly: Number(data.invoiceDaysYearly || 7),
      simCostPerDevice: Number(data.simCostPerDevice || 150),
      monthlyYearlyThreshold: Number(data.monthlyYearlyThreshold || 2000),
      soundEvents: toJsonText(data.soundEvents),
      soundAlarms: toJsonText(data.soundAlarms),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

async function migrateUserPins(db: FirebaseFirestore.Firestore) {
  await migrateCollection(db, 'userPins', async (id, data) => {
    await prisma.userPin.upsert({
      where: { userId: id },
      update: { pin: String(data.pin || '') },
      create: {
        userId: id,
        pin: String(data.pin || ''),
      },
    });
  });
}

async function seedRegistrationNumbersFromSales() {
  const sales = await prisma.sale.findMany({
    select: { phoneRobocall: true, contactNumber: true, customerName: true },
  });

  for (const sale of sales) {
    const phones = [sale.phoneRobocall, sale.contactNumber]
      .filter(Boolean)
      .flatMap((p) => String(p).split(','))
      .map((p) => normalizePhoneNumber(p).local)
      .filter(Boolean) as string[];

    for (const phone of phones) {
      try {
        const traccarClient = await getTraccarClient();
        const response = await traccarClient.get<any[]>(`/users?username=${encodeURIComponent(phone)}`);
        const matchedUser = response.data?.find((u) => !u.administrator && !u.manager);
        if (!matchedUser) continue;

        let dbUser = await prisma.user.findUnique({ where: { traccarId: matchedUser.id } });
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              traccarId: matchedUser.id,
              name: matchedUser.name || sale.customerName || phone,
            },
          });
        }

        await prisma.registrationNumber.upsert({
          where: { number: phone },
          update: { userId: dbUser.id },
          create: { number: phone, userId: dbUser.id },
        });
      } catch {
        // skip if Traccar unavailable
      }
    }
  }
}

async function syncTraccarDevices() {
  try {
    const traccarClient = await getTraccarClient();
    const response = await traccarClient.get<any[]>('/devices');
    const devices = response.data || [];
    console.log(`Syncing ${devices.length} Traccar devices to PostgreSQL`);
    for (const device of devices) {
      await prisma.device.upsert({
        where: { id: device.id },
        update: {
          name: device.name,
          uniqueId: device.uniqueId,
          status: device.status,
          lastUpdate: device.lastUpdate ? new Date(device.lastUpdate) : null,
          positionId: device.positionId || null,
          attributes: JSON.stringify(device.attributes || {}),
          userId: device.userId || null,
          updatedAt: new Date(),
        },
        create: {
          id: device.id,
          name: device.name,
          uniqueId: device.uniqueId,
          status: device.status,
          lastUpdate: device.lastUpdate ? new Date(device.lastUpdate) : null,
          positionId: device.positionId || null,
          attributes: JSON.stringify(device.attributes || {}),
          userId: device.userId || null,
        },
      });
    }
  } catch (error) {
    console.warn('Traccar device sync skipped:', error);
  }
}

async function main() {
  console.log('Starting Firestore → PostgreSQL migration...');
  const db = initFirebase();

  await migrateAppSettings(db);
  await migrateSales(db);
  await migrateInvoices(db);
  await migrateInvoiceItems(db);
  await migrateExpenses(db);
  await migrateInventory(db);
  await migrateDealers(db);
  await migrateCompanyVehicles(db);
  await migrateLogs(db);
  await migrateApprovals(db);
  await migrateCustomCommands(db);
  await migrateUserPins(db);

  console.log('Seeding registration numbers from sales + Traccar...');
  await seedRegistrationNumbersFromSales();

  console.log('Syncing Traccar devices...');
  await syncTraccarDevices();

  console.log('Migration completed successfully.');
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
