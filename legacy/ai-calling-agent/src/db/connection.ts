import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigurationError';
  }
}

export const TARGET_DATABASE_NAME = 'ai_calling_agent_os';
export const ALLOWED_TEST_DATABASES = ['ai_calling_agent_os', 'ai_calling_agent_os_test'];

let pool: Pool | null = null;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new DatabaseConfigurationError(
      `[DATABASE FATAL] DATABASE_URL is not set.\n` +
      `AI Calling Agent OS strictly requires a dedicated PostgreSQL / Neon database.\n` +
      `In-memory and JSON-file customer storage are strictly prohibited in production.\n` +
      `Please configure DATABASE_URL in your environment:\n` +
      `  Example: postgresql://<user>:<password>@<ep-name>.us-east-2.aws.neon.tech/${TARGET_DATABASE_NAME}?sslmode=require`
    );
  }
  return url.trim();
}

/**
 * Validates target database name to guarantee complete isolation.
 * Strictly prohibits connecting to 'second-brain', 'second_brain', or default 'neondb'.
 */
export function validateDatabaseTarget(databaseUrl: string): { host: string; database: string } {
  try {
    const parsed = new URL(databaseUrl);
    const databaseName = parsed.pathname.replace(/^\//, '');
    const host = parsed.hostname;

    if (!databaseName) {
      throw new DatabaseConfigurationError(
        `[DATABASE SAFETY ERROR] Database name is missing from DATABASE_URL. Target must be "${TARGET_DATABASE_NAME}".`
      );
    }

    const lowerDb = databaseName.toLowerCase();

    // Absolute prohibition against touching Second Brain or shared default databases
    if (lowerDb === 'second-brain' || lowerDb === 'second_brain' || lowerDb === 'neondb') {
      throw new DatabaseConfigurationError(
        `[DATABASE COLLISION PROHIBITED] DATABASE_URL points to "${databaseName}".\n` +
        `Connecting to "${databaseName}" is strictly blocked to prevent collision with Second Brain or unpartitioned default databases.\n` +
        `AI Calling Agent OS must connect exclusively to dedicated database "${TARGET_DATABASE_NAME}".`
      );
    }

    const isTest = process.env.NODE_ENV === 'test';
    if (!ALLOWED_TEST_DATABASES.includes(lowerDb) && !isTest) {
      throw new DatabaseConfigurationError(
        `[DATABASE MISCONFIGURATION] Invalid database "${databaseName}". Production database must be "${TARGET_DATABASE_NAME}".`
      );
    }

    return { host, database: databaseName };
  } catch (err) {
    if (err instanceof DatabaseConfigurationError) throw err;
    throw new DatabaseConfigurationError(
      `[DATABASE FATAL] DATABASE_URL format is invalid: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function getPool(): Pool {
  if (pool) return pool;

  const url = getDatabaseUrl();
  const { host, database } = validateDatabaseTarget(url);

  console.log(`[DATABASE] Initializing PostgreSQL connection pool: host="${host}", database="${database}"`);

  // Enforce TLS with valid certificate verification in cloud environments
  const isSslDisabled = url.includes('sslmode=disable') || url.includes('localhost') || url.includes('127.0.0.1');

  pool = new Pool({
    connectionString: url,
    ssl: isSslDisabled ? false : { rejectUnauthorized: true },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('[DATABASE POOL ERROR] Unexpected client error on idle PostgreSQL connection:', err);
  });

  return pool;
}

export type QueryInterceptor = (
  text: string,
  params?: unknown[]
) => Promise<QueryResult<QueryResultRow> | null> | QueryResult<QueryResultRow> | null;

let testQueryHandler: QueryInterceptor | null = null;

export function setTestQueryHandler(handler: QueryInterceptor | null): void {
  testQueryHandler = handler;
}

/**
 * Strict parameterization query helper.
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<R>> {
  if (testQueryHandler) {
    const intercepted = await testQueryHandler(text, params);
    if (intercepted !== null) {
      return intercepted as unknown as QueryResult<R>;
    }
  }
  const p = getPool();
  const start = Date.now();
  try {
    const res = await p.query<R>(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL === 'true') {
      console.log(`[SQL] (${duration}ms) ${text.slice(0, 100)}...`);
    }
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SQL ERROR] Query failed: "${text.slice(0, 150)}..." Error:`, msg);
    throw err;
  }
}

/**
 * Execute operations within an atomic database transaction.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (testQueryHandler) {
    const mockClient = {
      query: async (text: string, params?: unknown[]) => {
        if (text.includes('set_config(')) {
          return { rows: [{ set_config: '' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
        }
        return query(text, params);
      },
      release: () => {},
    } as unknown as PoolClient;
    return await callback(mockClient);
  }

  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Executes operations within an isolated transaction where PostgreSQL's session-level
 * tenant context (`app.current_tenant_id` and optional `app.current_user_id`)
 * is set using transaction-local configuration (`SET LOCAL`).
 * Guarantees strict Row-Level Security (RLS) policy enforcement and resets automatically.
 */
export async function withTenantContext<T>(
  tenantId: string,
  userId: string | undefined,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    if (userId) {
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    }
    return await callback(client);
  });
}

/**
 * Executes operations within an isolated transaction where PostgreSQL's session-level
 * system context (`app.is_system_bypass = 'true'`) is set using transaction-local configuration.
 * Strictly reserved for bootstrap, database migrations, and administrative authentication lookups.
 */
export async function withSystemContext<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query(`SELECT set_config('app.is_system_bypass', 'true', true)`);
    return await callback(client);
  });
}

/**
 * Health check verifying live PostgreSQL connectivity and verified database identity.
 */
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  databaseName?: string;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const res = await query<{ alive: number; db_name: string; current_time: string }>(
      'SELECT 1 as alive, current_database() as db_name, NOW() as current_time'
    );
    const latencyMs = Date.now() - start;
    if (res.rows.length > 0) {
      const activeDb = res.rows[0].db_name;
      const lower = activeDb.toLowerCase();
      if (lower === 'second-brain' || lower === 'second_brain' || lower === 'neondb') {
        return {
          status: 'unhealthy',
          databaseName: activeDb,
          latencyMs,
          error: `Connected to prohibited database "${activeDb}". Must connect to "${TARGET_DATABASE_NAME}".`,
        };
      }
      return { status: 'healthy', databaseName: activeDb, latencyMs };
    }
    return { status: 'unhealthy', latencyMs, error: 'Empty result from ping query' };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Cleanly close connection pool during shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
