import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Triggers the Firestore-to-PostgreSQL migration script.
 * Keeps scripts/migrate-firestore-to-postgres.ts intact as the source of truth.
 */
export async function migrateFromFirestoreToPostgres() {
  const scriptPath = path.join(process.cwd(), 'scripts', 'migrate-firestore-to-postgres.ts');
  const { stdout, stderr } = await execAsync(`npx tsx "${scriptPath}"`, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  });
  return { success: true, stdout, stderr };
}

/** @deprecated Use migrateFromFirestoreToPostgres */
export const migrateFromFirestoreToMySQL = migrateFromFirestoreToPostgres;
