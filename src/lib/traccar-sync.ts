import { traccarClient } from '@/lib/traccar-client';
import prisma from '@/lib/prisma/client';
import { normalizePhoneNumber } from '@/lib/utils';

type TraccarUser = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  username?: string;
  administrator?: boolean;
  manager?: boolean;
};

type TraccarDevice = {
  id: number;
  name: string;
  uniqueId: string;
  status?: string;
  lastUpdate?: string;
  positionId?: number;
  attributes?: Record<string, unknown>;
  userId?: number;
};

export type RegSyncStats = {
  usersSynced: number;
  devicesSynced: number;
  fromUsername: number;
  fromUserPhone: number;
  fromDeviceRobocall: number;
  fromSalesRobocall: number;
  registrationNumbersSaved: number;
};

function extractPhoneCandidates(raw?: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      String(raw)
        .split(/[,;/|\s]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => normalizePhoneNumber(part).local)
        .filter((local): local is string => Boolean(local && local.length >= 10 && local.startsWith('0')))
    )
  );
}

type RegNumberSource = 'fromUsername' | 'fromUserPhone' | 'fromDeviceRobocall' | 'fromSalesRobocall';

async function ensureDbUser(traccarUser: {
  id: number;
  name?: string;
  email?: string;
  phone?: string | null;
}) {
  const phone = extractPhoneCandidates(traccarUser.phone)[0] || null;

  let user = await prisma.user.findUnique({ where: { traccarId: traccarUser.id } });
  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: traccarUser.name || user.name,
        email: traccarUser.email || user.email,
        phone: user.phone || phone,
      },
    });
    return user;
  }

  if (phone) {
    const byPhone = await prisma.user.findUnique({ where: { phone } });
    if (byPhone) {
      return prisma.user.update({
        where: { id: byPhone.id },
        data: {
          traccarId: traccarUser.id,
          name: byPhone.name || traccarUser.name || phone,
          email: byPhone.email || traccarUser.email || null,
        },
      });
    }
  }

  return prisma.user.create({
    data: {
      traccarId: traccarUser.id,
      name: traccarUser.name || `Traccar User ${traccarUser.id}`,
      email: traccarUser.email || null,
      phone,
      status: 'active',
    },
  });
}

async function saveRegistrationNumber(userId: number, number: string) {
  await prisma.registrationNumber.upsert({
    where: { number },
    update: { userId },
    create: { number, userId },
  });
}

/**
 * Sync Traccar users/devices and seed PostgreSQL registration numbers from:
 * 1. Username (when username is a phone number)
 * 2. User phone field
 * 3. Device phoneRobocall attribute (linked by attributes.uId / userId)
 * 4. Sales phoneRobocall / contactNumber (matched to Traccar owners)
 */
export async function syncRegistrationNumbersFromTraccar(): Promise<RegSyncStats> {
  const stats: RegSyncStats = {
    usersSynced: 0,
    devicesSynced: 0,
    fromUsername: 0,
    fromUserPhone: 0,
    fromDeviceRobocall: 0,
    fromSalesRobocall: 0,
    registrationNumbersSaved: 0,
  };

  const savedPairs = new Set<string>();
  const rememberSaved = async (userId: number, number: string, source: RegNumberSource) => {
    const key = `${userId}:${number}`;
    if (savedPairs.has(key)) return;
    await saveRegistrationNumber(userId, number);
    savedPairs.add(key);
    stats.registrationNumbersSaved += 1;
    stats[source] += 1;
  };

  const usersRes = await traccarClient.get<TraccarUser[]>('/users');
  const traccarUsers = usersRes.data || [];
  const usersById = new Map(traccarUsers.map((u) => [u.id, u]));
  const dbUserByTraccarId = new Map<number, { id: number }>();

  for (const tUser of traccarUsers) {
    const dbUser = await ensureDbUser(tUser);
    dbUserByTraccarId.set(tUser.id, { id: dbUser.id });
    stats.usersSynced += 1;

    // Skip staff accounts for registration-number seeding.
    if (tUser.administrator || tUser.manager) continue;

    const usernamePhones = extractPhoneCandidates(tUser.username);
    for (const phone of usernamePhones) {
      await rememberSaved(dbUser.id, phone, 'fromUsername');
    }

    const userPhones = extractPhoneCandidates(tUser.phone);
    for (const phone of userPhones) {
      await rememberSaved(dbUser.id, phone, 'fromUserPhone');
    }
  }

  const devicesRes = await traccarClient.get<TraccarDevice[]>('/devices');
  const devices = devicesRes.data || [];

  for (const device of devices) {
    const ownerTraccarId = Number(
      device.attributes?.uId || device.attributes?.userId || device.userId || 0
    );

    await prisma.device.upsert({
      where: { id: device.id },
      update: {
        name: device.name,
        uniqueId: device.uniqueId,
        status: device.status || 'unknown',
        lastUpdate: device.lastUpdate ? new Date(device.lastUpdate) : null,
        positionId: device.positionId || null,
        attributes: JSON.stringify(device.attributes || {}),
        userId: ownerTraccarId || null,
        updatedAt: new Date(),
      },
      create: {
        id: device.id,
        name: device.name,
        uniqueId: device.uniqueId,
        status: device.status || 'unknown',
        lastUpdate: device.lastUpdate ? new Date(device.lastUpdate) : null,
        positionId: device.positionId || null,
        attributes: JSON.stringify(device.attributes || {}),
        userId: ownerTraccarId || null,
      },
    });
    stats.devicesSynced += 1;

    const robocallPhones = extractPhoneCandidates(
      typeof device.attributes?.phoneRobocall === 'string'
        ? device.attributes.phoneRobocall
        : typeof device.attributes?.phone === 'string'
          ? device.attributes.phone
          : null
    );
    if (!ownerTraccarId || robocallPhones.length === 0) continue;

    let dbUser = dbUserByTraccarId.get(ownerTraccarId);
    if (!dbUser) {
      const tUser = usersById.get(ownerTraccarId);
      const ensured = await ensureDbUser(
        tUser || {
          id: ownerTraccarId,
          name: `Traccar User ${ownerTraccarId}`,
        }
      );
      dbUser = { id: ensured.id };
      dbUserByTraccarId.set(ownerTraccarId, dbUser);
    }

    for (const phone of robocallPhones) {
      await rememberSaved(dbUser.id, phone, 'fromDeviceRobocall');
    }
  }

  // Sales table: phoneRobocall / contactNumber linked by IMEI → device owner,
  // with username match fallback.
  const sales = await prisma.sale.findMany({
    select: {
      imei: true,
      phoneRobocall: true,
      contactNumber: true,
      customerName: true,
    },
  });

  const devicesByImei = new Map(devices.map((d) => [d.uniqueId, d]));

  for (const sale of sales) {
    const phones = [
      ...extractPhoneCandidates(sale.phoneRobocall),
      ...extractPhoneCandidates(sale.contactNumber),
    ];
    if (phones.length === 0) continue;

    let ownerTraccarId = 0;
    if (sale.imei && devicesByImei.has(sale.imei)) {
      const device = devicesByImei.get(sale.imei)!;
      ownerTraccarId = Number(
        device.attributes?.uId || device.attributes?.userId || device.userId || 0
      );
    }

    for (const phone of phones) {
      let dbUserId: number | null = null;

      if (ownerTraccarId) {
        let dbUser = dbUserByTraccarId.get(ownerTraccarId);
        if (!dbUser) {
          const tUser = usersById.get(ownerTraccarId);
          const ensured = await ensureDbUser(
            tUser || {
              id: ownerTraccarId,
              name: sale.customerName || `Traccar User ${ownerTraccarId}`,
            }
          );
          dbUser = { id: ensured.id };
          dbUserByTraccarId.set(ownerTraccarId, dbUser);
        }
        dbUserId = dbUser.id;
      } else {
        // Fallback: match Traccar username == phone
        const matchedUser = traccarUsers.find((u) => {
          if (u.administrator || u.manager) return false;
          return extractPhoneCandidates(u.username).includes(phone) || extractPhoneCandidates(u.phone).includes(phone);
        });
        if (matchedUser) {
          let dbUser = dbUserByTraccarId.get(matchedUser.id);
          if (!dbUser) {
            const ensured = await ensureDbUser(matchedUser);
            dbUser = { id: ensured.id };
            dbUserByTraccarId.set(matchedUser.id, dbUser);
          }
          dbUserId = dbUser.id;
        }
      }

      if (!dbUserId) continue;
      await rememberSaved(dbUserId, phone, 'fromSalesRobocall');
    }
  }

  return stats;
}

export async function syncTraccarUsers() {
  const stats = await syncRegistrationNumbersFromTraccar();
  return { success: true, count: stats.usersSynced, stats };
}
