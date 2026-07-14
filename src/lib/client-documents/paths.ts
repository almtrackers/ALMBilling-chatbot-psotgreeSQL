import path from 'path';

const INVALID_FS_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/** Sanitize a folder/file segment for the filesystem. */
export function sanitizeFsName(input: string, fallback = 'unknown'): string {
  const cleaned = (input || '')
    .trim()
    .replace(INVALID_FS_CHARS, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned || fallback;
}

/** Last 6 digits of a normalized CNIC (digits only or dashed). */
export function cnicLastSix(cnic: string): string {
  const digits = (cnic || '').replace(/\D/g, '');
  if (digits.length < 6) return digits.padStart(6, '0');
  return digits.slice(-6);
}

export function sanitizeVehicleFolder(vehicleNumber: string): string {
  return sanitizeFsName(vehicleNumber.replace(/\s+/g, '-'), 'vehicle');
}

/**
 * Relative client root: clients/<last6>/<Customer_Name>
 * (Stored in DB without the uploads/ prefix.)
 */
export function clientRelativeDir(cnic: string, customerName: string): string {
  return path.posix.join('clients', cnicLastSix(cnic), sanitizeFsName(customerName, 'customer'));
}

export function vehicleRelativeDir(
  cnic: string,
  customerName: string,
  vehicleNumber: string
): string {
  return path.posix.join(
    clientRelativeDir(cnic, customerName),
    sanitizeVehicleFolder(vehicleNumber)
  );
}

/** Absolute uploads root on disk. */
export function uploadsRoot(): string {
  return path.join(process.cwd(), 'uploads');
}

/** Resolve a relative DB path to absolute, rejecting traversal. */
export function resolveSafeUploadPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    !normalized.startsWith('clients/') ||
    normalized.includes('..') ||
    normalized.includes('\0')
  ) {
    throw new Error('Invalid document path');
  }
  const absolute = path.resolve(uploadsRoot(), normalized);
  const root = path.resolve(uploadsRoot());
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw new Error('Invalid document path');
  }
  return absolute;
}
