import { Timestamp } from 'firebase/firestore';

/**
 * Parses a JSON-encoded database field into a typed value.
 */
export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/**
 * Converts API/Postgres date values into Firestore Timestamp objects
 * for components that still expect Timestamp-shaped fields.
 */
export function toTimestamp(value: unknown): Timestamp | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value;
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const v = value as { seconds: number; nanoseconds?: number };
    return new Timestamp(v.seconds, v.nanoseconds ?? 0);
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return undefined;
  return Timestamp.fromDate(date);
}

/**
 * Serializes a record's date fields to ISO strings for JSON API responses.
 */
export function serializeDates<T extends Record<string, unknown>>(
  record: T,
  dateFields: (keyof T)[]
): T {
  const result = { ...record };
  for (const field of dateFields) {
    const value = result[field];
    if (value instanceof Date) {
      (result as Record<string, unknown>)[field as string] = value.toISOString();
    }
  }
  return result;
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Normalizes a Prisma Sale record for JSON API responses.
 * Converts Decimal fields to numbers and parses JSON-encoded fields.
 */
export function serializeSale<T extends Record<string, unknown>>(sale: T) {
  return {
    ...sale,
    amount: toNumber(sale.amount),
    devicePrice: toOptionalNumber(sale.devicePrice),
    currentPeriodCharges: toOptionalNumber(sale.currentPeriodCharges),
    commission: toOptionalNumber(sale.commission),
    renewalFee: toOptionalNumber(sale.renewalFee),
    simCharges: toOptionalNumber(sale.simCharges),
    discount: toOptionalNumber(sale.discount),
    date: toIsoString(sale.date),
    createdAt: toIsoString(sale.createdAt),
    unsubscribedAt: toIsoString(sale.unsubscribedAt),
    notificationIds: parseJsonField<number[]>(sale.notificationIds, []),
  };
}

/**
 * Normalizes a Prisma Expense record for JSON API responses.
 */
export function serializeExpense<T extends Record<string, unknown>>(expense: T) {
  return {
    ...expense,
    amount: toNumber(expense.amount),
    date: toIsoString(expense.date),
    createdAt: toIsoString(expense.createdAt),
    approvedAt: toIsoString(expense.approvedAt),
  };
}
