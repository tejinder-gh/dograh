import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env';

const adminUrl =
  env.TEST_ADMIN_DATABASE_URL ||
  process.env.TEST_ADMIN_DATABASE_URL ||
  env.MIGRATION_DATABASE_URL;

if (!adminUrl) {
  throw new Error('TEST_ADMIN_DATABASE_URL or MIGRATION_DATABASE_URL must be configured for test fixtures');
}

const adminPool = new Pool({
  connectionString: adminUrl,
  max: 5,
  idleTimeoutMillis: 10000,
});

export async function adminQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return adminPool.query<T>(text, params);
}

export async function closeAdminPool(): Promise<void> {
  await adminPool.end();
}

export { adminPool };
