import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { assertSafeDatabaseTarget } from '../config/database-guard';

const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  process.env.MIGRATION_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/acuity_test_isolated';

// Strictly verify test admin database target
assertSafeDatabaseTarget(adminUrl, 'test');

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
