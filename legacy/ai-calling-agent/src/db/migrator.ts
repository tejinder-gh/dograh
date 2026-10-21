import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { query, withTransaction } from './connection';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const DOWN_MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations/down');

export class MigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationIntegrityError';
  }
}

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
  checksum: string;
}

/**
 * Ensures the _migrations tracking table exists.
 */
export async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64) NOT NULL
    );
  `);
}

/**
 * Calculates SHA-256 checksum of migration content for tamper detection.
 */
export function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Runs all pending versioned migrations in sequential order.
 * Throws MigrationIntegrityError if an already-applied migration has been modified on disk.
 */
export async function runMigrations(): Promise<{ applied: string[]; alreadyApplied: string[] }> {
  await ensureMigrationsTable();

  // Retrieve already applied migrations
  const existingResult = await query<MigrationRecord>(
    'SELECT name, checksum FROM _migrations ORDER BY id ASC'
  );
  const appliedMap = new Map<string, string>();
  for (const row of existingResult.rows) {
    appliedMap.set(row.name, row.checksum);
  }

  // Read migration files from disk
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.warn(`[MIGRATOR] Migrations directory "${MIGRATIONS_DIR}" does not exist.`);
    return { applied: [], alreadyApplied: Array.from(appliedMap.keys()) };
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql') && !file.startsWith('.'))
    .sort();

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const checksum = computeChecksum(content);

    if (appliedMap.has(file)) {
      const storedChecksum = appliedMap.get(file);
      if (storedChecksum !== checksum) {
        throw new MigrationIntegrityError(
          `[MIGRATION INTEGRITY ERROR] Applied migration "${file}" checksum mismatch!\n` +
          `Database recorded checksum: ${storedChecksum}\n` +
          `Current file checksum:      ${checksum}\n` +
          `Tampering or modifying applied migrations is prohibited. Create a new sequential migration instead.`
        );
      }
      alreadyApplied.push(file);
      continue;
    }

    console.log(`[MIGRATOR] Applying migration: "${file}"...`);

    await withTransaction(async (client) => {
      await client.query(content);
      await client.query(
        'INSERT INTO _migrations (name, checksum) VALUES ($1, $2)',
        [file, checksum]
      );
    });

    applied.push(file);
    console.log(`[MIGRATOR] Successfully applied: "${file}"`);
  }

  return { applied, alreadyApplied };
}

/**
 * Reverts the most recently applied migration using the corresponding down script.
 */
export async function rollbackLastMigration(): Promise<{ rolledBack: string | null }> {
  await ensureMigrationsTable();

  const latestResult = await query<MigrationRecord>(
    'SELECT id, name FROM _migrations ORDER BY id DESC LIMIT 1'
  );

  if (latestResult.rows.length === 0) {
    console.log('[MIGRATOR] No applied migrations to rollback.');
    return { rolledBack: null };
  }

  const latest = latestResult.rows[0];
  const baseName = latest.name.replace(/\.sql$/, '');
  const downFile = `${baseName}_down.sql`;
  const downFilePath = path.join(DOWN_MIGRATIONS_DIR, downFile);

  if (!fs.existsSync(downFilePath)) {
    throw new Error(
      `[MIGRATOR ROLLBACK ERROR] Down migration file "${downFilePath}" does not exist for "${latest.name}".`
    );
  }

  const downContent = fs.readFileSync(downFilePath, 'utf-8');

  console.log(`[MIGRATOR] Rolling back migration "${latest.name}" using "${downFile}"...`);

  await withTransaction(async (client) => {
    await client.query(downContent);
    await client.query('DELETE FROM _migrations WHERE id = $1', [latest.id]);
  });

  console.log(`[MIGRATOR] Successfully rolled back "${latest.name}".`);
  return { rolledBack: latest.name };
}

// Allow standalone execution: `bun src/db/migrator.ts` or `tsx src/db/migrator.ts`
if (import.meta.url.endsWith(process.argv[1] || '')) {
  (async () => {
    try {
      const isRollback = process.argv.includes('--rollback');
      if (isRollback) {
        console.log('[MIGRATOR] Initiating database rollback...');
        const result = await rollbackLastMigration();
        console.log(`[MIGRATOR] Rollback completed for: ${result.rolledBack || 'none'}`);
      } else {
        console.log('[MIGRATOR] Starting database migration run...');
        const result = await runMigrations();
        console.log(`[MIGRATOR] Completed. Applied ${result.applied.length} new migrations.`);
      }
      process.exit(0);
    } catch (err) {
      console.error('[MIGRATOR FATAL] Migration failed:', err);
      process.exit(1);
    }
  })();
}
