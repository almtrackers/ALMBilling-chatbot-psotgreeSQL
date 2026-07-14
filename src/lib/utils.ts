import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizePhoneNumber(input: string) {
  const trimmed = (input || '').trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  const digits = digitsOnly.startsWith('00') ? digitsOnly.slice(2) : digitsOnly;

  let local = digits;
  if (digits.startsWith('92') && digits.length === 12) {
    local = `0${digits.slice(2)}`;
  } else if (digits.startsWith('3') && digits.length === 10) {
    local = `0${digits}`;
  }

  let international = digits;
  if (local.startsWith('0') && local.length === 11) {
    international = `92${local.slice(1)}`;
  }

  return {
    raw: trimmed,
    digits,
    local,
    international,
  };
}

/**
 * Format phone for Traccar SMS Gateway API: always +923001234567
 * Accepts 923001234567, 3001234567, 03001234567, +923001234567, etc.
 */
export function toSmsE164(input: string): string | null {
  const { international, digits } = normalizePhoneNumber(input);
  const candidate = international || digits;
  if (!candidate || candidate.length < 10) return null;

  // Pakistan mobile: 92 + 10 digits (3XXXXXXXXX)
  if (candidate.startsWith('92') && candidate.length === 12) {
    return `+${candidate}`;
  }

  // Already has country code of another length — still prefix +
  if (candidate.length >= 11 && candidate.length <= 15) {
    return `+${candidate}`;
  }

  return null;
}

export function getPhoneLookupVariants(input: string) {
  const normalized = normalizePhoneNumber(input);
  return Array.from(
    new Set(
      [normalized.raw, normalized.digits, normalized.local, normalized.international]
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );
}

export function normalizeMultiplePhoneNumbers(phones: string): string | null {
  const numbers = phones.split(',').map((num) => num.trim()).filter((num) => num.length > 0);

  if (numbers.length === 0) return null;

  const normalized = numbers
    .map((num) => {
      const result = normalizePhoneNumber(num);
      return result.local || null;
    })
    .filter(Boolean);

  if (normalized.length === 0 || normalized.length !== numbers.length) {
    return null;
  }

  return normalized.join(',');
}

/** Converts Firestore Timestamp, ISO string, or Date to a JS Date. */
export function toJsDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
