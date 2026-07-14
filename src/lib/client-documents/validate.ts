export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.pdf',
]);

export const ALLOWED_DOCUMENT_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',
  '.js',
  '.mjs',
  '.sh',
  '.php',
  '.asp',
  '.aspx',
  '.dll',
  '.vbs',
  '.ps1',
]);

export type NormalizedCnic = {
  formatted: string; // 35202-1234567-1
  digits: string; // 13 digits
};

/** Normalize CNIC from 13 digits or dashed form. */
export function normalizeCnic(input: string): NormalizedCnic | null {
  const trimmed = (input || '').trim();
  const dashed = trimmed.match(/^(\d{5})-(\d{7})-(\d)$/);
  if (dashed) {
    return {
      formatted: `${dashed[1]}-${dashed[2]}-${dashed[3]}`,
      digits: `${dashed[1]}${dashed[2]}${dashed[3]}`,
    };
  }
  const digits = trimmed.replace(/\D/g, '');
  if (/^\d{13}$/.test(digits)) {
    return {
      formatted: `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`,
      digits,
    };
  }
  return null;
}

export function getExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || '';
  const idx = base.lastIndexOf('.');
  if (idx < 0) return '';
  return base.slice(idx).toLowerCase();
}

export function validateDocumentFile(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true; ext: string } | { ok: false; message: string } {
  if (!file || file.size <= 0) {
    return { ok: false, message: 'File is empty or missing.' };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: 'File size exceeded. Maximum is 10 MB.' };
  }

  const ext = getExtension(file.name);
  if (!ext) {
    return { ok: false, message: 'File must have an extension (jpg, jpeg, png, or pdf).' };
  }
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, message: 'Executable or unsafe file types are not allowed.' };
  }
  if (!ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
    return { ok: false, message: 'Invalid file type. Allowed: JPG, JPEG, PNG, PDF.' };
  }

  const mime = (file.type || '').toLowerCase();
  if (mime && !ALLOWED_DOCUMENT_MIMES.has(mime) && mime !== 'application/octet-stream') {
    return { ok: false, message: 'Invalid MIME type. Allowed: JPG, JPEG, PNG, PDF.' };
  }

  return { ok: true, ext };
}

export type DocKind = 'cnic_front' | 'cnic_back' | 'vehicle_card';

export function isDocKind(value: string): value is DocKind {
  return value === 'cnic_front' || value === 'cnic_back' || value === 'vehicle_card';
}
