import fs from 'fs/promises';
import path from 'path';
import {
  clientRelativeDir,
  resolveSafeUploadPath,
  uploadsRoot,
  vehicleRelativeDir,
} from '@/lib/client-documents/paths';
import {
  type DocKind,
  validateDocumentFile,
} from '@/lib/client-documents/validate';

export type StoredDocument = {
  /** Relative path stored in DB, e.g. clients/345671/Name/cnic_front.jpg */
  relativePath: string;
  absolutePath: string;
};

async function ensureDir(absDir: string) {
  await fs.mkdir(absDir, { recursive: true });
}

async function uniquePath(
  absDir: string,
  baseName: string,
  ext: string
): Promise<{ absolutePath: string; fileName: string }> {
  let fileName = `${baseName}${ext}`;
  let absolutePath = path.join(absDir, fileName);
  let n = 1;
  while (true) {
    try {
      await fs.access(absolutePath);
      fileName = `${baseName}_${n}${ext}`;
      absolutePath = path.join(absDir, fileName);
      n += 1;
    } catch {
      return { absolutePath, fileName };
    }
  }
}

export async function saveClientDocument(options: {
  cnic: string;
  customerName: string;
  kind: Extract<DocKind, 'cnic_front' | 'cnic_back'>;
  file: File;
  actor?: string;
}): Promise<StoredDocument> {
  const validation = validateDocumentFile({
    name: options.file.name,
    type: options.file.type,
    size: options.file.size,
  });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const relativeDir = clientRelativeDir(options.cnic, options.customerName);
  const absDir = path.join(uploadsRoot(), relativeDir);
  await ensureDir(absDir);

  const { absolutePath, fileName } = await uniquePath(
    absDir,
    options.kind,
    validation.ext
  );
  const buffer = Buffer.from(await options.file.arrayBuffer());
  await fs.writeFile(absolutePath, buffer);

  const relativePath = path.posix.join(relativeDir.replace(/\\/g, '/'), fileName);
  console.info(
    `[client-docs] upload kind=${options.kind} path=${relativePath} actor=${options.actor || 'unknown'} size=${options.file.size}`
  );

  return { relativePath, absolutePath };
}

export async function saveVehicleCard(options: {
  cnic: string;
  customerName: string;
  vehicleNumber: string;
  file: File;
  actor?: string;
}): Promise<StoredDocument> {
  const validation = validateDocumentFile({
    name: options.file.name,
    type: options.file.type,
    size: options.file.size,
  });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const relativeDir = vehicleRelativeDir(
    options.cnic,
    options.customerName,
    options.vehicleNumber
  );
  const absDir = path.join(uploadsRoot(), relativeDir);
  await ensureDir(absDir);

  const { absolutePath, fileName } = await uniquePath(
    absDir,
    'vehicle_card',
    validation.ext
  );
  const buffer = Buffer.from(await options.file.arrayBuffer());
  await fs.writeFile(absolutePath, buffer);

  const relativePath = path.posix.join(relativeDir.replace(/\\/g, '/'), fileName);
  console.info(
    `[client-docs] upload kind=vehicle_card path=${relativePath} actor=${options.actor || 'unknown'} size=${options.file.size}`
  );

  return { relativePath, absolutePath };
}

export async function readUploadFile(relativePath: string): Promise<{
  absolutePath: string;
  data: Buffer;
  contentType: string;
  fileName: string;
}> {
  const absolutePath = resolveSafeUploadPath(relativePath);
  const data = await fs.readFile(absolutePath);
  const fileName = path.basename(absolutePath);
  const ext = path.extname(fileName).toLowerCase();
  const contentType =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.png'
        ? 'image/png'
        : 'image/jpeg';
  return { absolutePath, data, contentType, fileName };
}

export async function replaceUploadFile(options: {
  previousRelativePath: string | null | undefined;
  cnic: string;
  customerName: string;
  kind: DocKind;
  vehicleNumber?: string;
  file: File;
  actor?: string;
}): Promise<StoredDocument> {
  let stored: StoredDocument;
  if (options.kind === 'vehicle_card') {
    if (!options.vehicleNumber) {
      throw new Error('Vehicle number is required for vehicle card uploads.');
    }
    stored = await saveVehicleCard({
      cnic: options.cnic,
      customerName: options.customerName,
      vehicleNumber: options.vehicleNumber,
      file: options.file,
      actor: options.actor,
    });
  } else {
    stored = await saveClientDocument({
      cnic: options.cnic,
      customerName: options.customerName,
      kind: options.kind,
      file: options.file,
      actor: options.actor,
    });
  }

  if (
    options.previousRelativePath &&
    options.previousRelativePath !== stored.relativePath
  ) {
    try {
      const oldAbs = resolveSafeUploadPath(options.previousRelativePath);
      await fs.unlink(oldAbs);
    } catch {
      // previous file may already be gone
    }
  }

  console.info(
    `[client-docs] replace kind=${options.kind} path=${stored.relativePath} actor=${options.actor || 'unknown'}`
  );

  return stored;
}
