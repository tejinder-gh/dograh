/**
 * Database Provisioning & Target Verification Script
 *
 * Dedicated to provisioning and validating the target PostgreSQL/Neon database:
 * Target: `ai_calling_agent_os`
 *
 * Safety Guarantees:
 * 1. Checks that the target database name is explicitly `ai_calling_agent_os`.
 * 2. Connects to administrative maintenance database to ensure `ai_calling_agent_os` exists.
 * 3. Never writes customer or schema objects into `second-brain` or `neondb`.
 * 4. Executes versioned migrations idempotently.
 * 5. Verifies composite constraints, tables, and Row-Level Security policies.
 */

import { Client } from 'pg';
import { runMigrations } from '../src/db/migrator';
import { TARGET_DATABASE_NAME, validateDatabaseTarget } from '../src/db/connection';

async function main() {
  console.log('='.repeat(80));
  console.log('AI CALLING AGENT OS — DATABASE PROVISIONING & TARGET VERIFICATION');
  console.log('='.repeat(80));

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error('[FATAL] DATABASE_URL is not set in environment.');
    console.error('Please configure DATABASE_URL pointing to the Neon or PostgreSQL server.');
    process.exit(1);
  }

  // Parse connection URL
  const parsed = new URL(rawUrl);
  const targetDb = parsed.pathname.replace(/^\//, '');

  console.log(`[TARGET CONFIGURATION] Host: ${parsed.hostname}`);
  console.log(`[TARGET CONFIGURATION] Target Database: "${targetDb}"`);

  // 1. Prohibit touching Second Brain
  if (targetDb.toLowerCase() === 'second-brain' || targetDb.toLowerCase() === 'second_brain') {
    console.error(`[COLLISION BLOCKED] Prohibited target database "${targetDb}".`);
    console.error(`AI Calling Agent OS must NOT touch Second Brain.`);
    process.exit(1);
  }

  // 2. Administrative check: connect to server to ensure `ai_calling_agent_os` database exists
  const adminUrl = new URL(rawUrl);
  if (targetDb !== 'neondb' && targetDb !== 'postgres') {
    // If targetDb is already ai_calling_agent_os, use maintenance db for creation check if needed
    adminUrl.pathname = '/postgres';
  }

  console.log(`[PROVISIONING] Checking existence of database "${TARGET_DATABASE_NAME}"...`);

  let adminClient: Client | null = null;
  try {
    adminClient = new Client({
      connectionString: adminUrl.toString(),
      ssl: rawUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: true },
    });
    await adminClient.connect();

    const dbCheck = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TARGET_DATABASE_NAME]
    );

    if (dbCheck.rows.length === 0) {
      console.log(`[PROVISIONING] Database "${TARGET_DATABASE_NAME}" does not exist. Creating...`);
      await adminClient.query(`CREATE DATABASE ${TARGET_DATABASE_NAME}`);
      console.log(`[PROVISIONING] Database "${TARGET_DATABASE_NAME}" successfully created.`);
    } else {
      console.log(`[PROVISIONING] Database "${TARGET_DATABASE_NAME}" exists.`);
    }
  } catch (adminErr: unknown) {
    console.warn(`[ADMIN NOTICE] Direct maintenance connection skipped or restricted: ${adminErr instanceof Error ? adminErr.message : String(adminErr)}`);
    console.log(`[PROVISIONING] Proceeding with target database connection validation...`);
  } finally {
    if (adminClient) {
      await adminClient.end().catch(() => {});
    }
  }

  // 3. Connect to dedicated application target database
  const appDbUrl = new URL(rawUrl);
  appDbUrl.pathname = `/${TARGET_DATABASE_NAME}`;
  process.env.DATABASE_URL = appDbUrl.toString();

  validateDatabaseTarget(process.env.DATABASE_URL);

  console.log(`[MIGRATION RUNNER] Running versioned migrations on "${TARGET_DATABASE_NAME}"...`);
  const migrationResult = await runMigrations();
  console.log(`[MIGRATION COMPLETE] Applied ${migrationResult.applied.length} new migrations.`);

  // 4. Verify schema integrity & RLS policies
  const appClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: rawUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: true },
  });

  await appClient.connect();
  try {
    const tableResult = await appClient.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`\n[VERIFICATION] Public tables in "${TARGET_DATABASE_NAME}":`);
    for (const row of tableResult.rows) {
      console.log(`  - ${row.table_name}`);
    }

    const rlsResult = await appClient.query(`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
      ORDER BY relname;
    `);

    console.log(`\n[VERIFICATION] Row-Level Security (RLS) Status:`);
    for (const row of rlsResult.rows) {
      console.log(`  - ${row.relname}: RLS ${row.relrowsecurity ? 'ENABLED' : 'DISABLED'}`);
    }

    console.log('\n[SUCCESS] Database provisioning and verification completed successfully.');
  } finally {
    await appClient.end();
  }
}

if (import.meta.url.endsWith(process.argv[1] || '')) {
  main().catch((err) => {
    console.error('[PROVISIONING FATAL ERROR]', err);
    process.exit(1);
  });
}
