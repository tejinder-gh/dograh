import fs from 'fs/promises';
import path from 'path';
import { query } from './database';

export async function runMigrations(): Promise<void> {
  const migrationPath = path.resolve(__dirname, '../../migrations/001_business_ext_init.sql');
  const sql = await fs.readFile(migrationPath, 'utf-8');

  // Ensure migrations tracking table exists in business_ext
  await query('CREATE SCHEMA IF NOT EXISTS business_ext;');
  await query(`
    CREATE TABLE IF NOT EXISTS business_ext.schema_migrations (
      id VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const migrationId = '001_business_ext_init';
  const check = await query('SELECT id FROM business_ext.schema_migrations WHERE id = $1', [migrationId]);

  if (check.rows.length === 0) {
    console.log(`Applying migration: ${migrationId}...`);
    await query(sql);
    await query('INSERT INTO business_ext.schema_migrations (id) VALUES ($1)', [migrationId]);
    console.log(`Migration ${migrationId} applied successfully.`);
  } else {
    // Re-run idempotent table creations if needed during development
    await query(sql);
  }
}

if (import.meta.main) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
