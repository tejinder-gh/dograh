import fs from 'fs/promises';
import path from 'path';
import { Pool, type PoolClient } from 'pg';
import { env } from './env';

const migrationDatabaseUrl =
  env.MIGRATION_DATABASE_URL ||
  process.env.MIGRATION_DATABASE_URL ||
  env.DATABASE_URL;

const migrationPool = new Pool(
  migrationDatabaseUrl
    ? { connectionString: migrationDatabaseUrl }
    : {
        host: env.POSTGRES_HOST,
        port: env.POSTGRES_PORT,
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB,
      }
);

// Lock key for advisory locking to prevent concurrent migrations racing
const MIGRATION_ADVISORY_LOCK_KEY = 718291;

export async function runMigrations(clientOverride?: PoolClient): Promise<void> {
  const client = clientOverride || (await migrationPool.connect());
  const shouldRelease = !clientOverride;

  try {
    const migrationsDir = path.resolve(__dirname, '../../migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

    await client.query('BEGIN');

    // Acquire transaction-scoped advisory lock to prevent concurrent migration race conditions
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);

    // Ensure migrations tracking table exists in business_ext
    await client.query('CREATE SCHEMA IF NOT EXISTS business_ext;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS business_ext.schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const file of sqlFiles) {
      const migrationId = path.basename(file, '.sql');
      const check = await client.query(
        'SELECT id FROM business_ext.schema_migrations WHERE id = $1 FOR UPDATE',
        [migrationId]
      );

      if (check.rows.length === 0) {
        console.log(`[migrator] Applying migration: ${migrationId}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, 'utf-8');
        await client.query(sql);
        await client.query('INSERT INTO business_ext.schema_migrations (id) VALUES ($1)', [migrationId]);
        console.log(`[migrator] Migration ${migrationId} applied successfully.`);
      } else {
        // Skip already applied migration
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors if connection was lost
    }
    console.error('[migrator] Migration transaction rolled back due to error:', error);
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

export async function closeMigrationPool(): Promise<void> {
  await migrationPool.end();
}

if (import.meta.main) {
  runMigrations()
    .then(async () => {
      console.log('[migrator] Migrations complete.');
      await closeMigrationPool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[migrator] Migration failed:', err);
      await closeMigrationPool();
      process.exit(1);
    });
}
