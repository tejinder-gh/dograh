/**
 * Database Target Safety Guard
 * 
 * Strict enforcement to prevent integration tests, test harnesses, or unapproved
 * operations from connecting to or mutating production database infrastructure
 * (specifically Neon branch br-twilight-base-b51aowww / ep-wispy-truth-b5kkygdq).
 */

export class ProductionDatabaseTargetError extends Error {
  constructor(target: string, reason: string) {
    super(
      `[DATABASE SAFETY VIOLATION] Refusing connection to production database target: ${target}. Reason: ${reason}`
    );
    this.name = 'ProductionDatabaseTargetError';
  }
}

export class UnsafeDatabaseTargetError extends Error {
  constructor(target: string, reason: string) {
    super(
      `[DATABASE SAFETY VIOLATION] Unsafe database target rejected: ${target}. Reason: ${reason}`
    );
    this.name = 'UnsafeDatabaseTargetError';
  }
}

export class MigrationInTestEnvironmentError extends Error {
  constructor() {
    super(
      '[DATABASE SAFETY VIOLATION] Automatic migration execution is strictly forbidden in test environment (beforeAll / bun test).'
    );
    this.name = 'MigrationInTestEnvironmentError';
  }
}

// Known production identifiers for Acuity Calling OS
const PRODUCTION_HOST_PATTERNS = [
  'ep-wispy-truth-b5kkygdq',
  'br-twilight-base-b51aowww',
  'ai_calling_owner',
];

const LOCAL_SAFE_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres', '::1']);

export function extractDatabaseHost(connectionStringOrHost?: string): string {
  if (!connectionStringOrHost) return '';
  const trimmed = connectionStringOrHost.trim();
  if (!trimmed.includes('://')) {
    return trimmed.split(':')[0] || '';
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.hostname.toLowerCase();
  } catch {
    // Regex fallback for postgresql://
    const match = trimmed.match(/@([^/:?]+)/);
    return match ? match[1]!.toLowerCase() : '';
  }
}

export function isProductionDatabaseTarget(connectionStringOrHost?: string): boolean {
  if (!connectionStringOrHost) return false;
  const lower = connectionStringOrHost.toLowerCase();
  return PRODUCTION_HOST_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function isLocalSafeTarget(connectionStringOrHost?: string): boolean {
  if (!connectionStringOrHost) return false;
  const host = extractDatabaseHost(connectionStringOrHost);
  return LOCAL_SAFE_HOSTS.has(host);
}

export type DatabaseExecutionContext = 'runtime' | 'test' | 'migration';

export function assertSafeDatabaseTarget(
  targetUrlOrHost: string | undefined,
  context: DatabaseExecutionContext = 'runtime'
): void {
  const isTestEnv =
    context === 'test' ||
    process.env.NODE_ENV === 'test' ||
    process.env.BUN_ENV === 'test' ||
    Boolean(process.env.VITEST);

  const target = targetUrlOrHost || process.env.DATABASE_URL || '';

  // 1. Production target check
  if (isProductionDatabaseTarget(target)) {
    if (isTestEnv) {
      throw new ProductionDatabaseTargetError(
        target.replace(/:[^@]+@/, ':***@'),
        'Automated test execution against the production Neon database branch is strictly blocked.'
      );
    }
  }

  // 2. In test mode, only permit verified local or explicitly authorized test branches
  if (isTestEnv) {
    const isExplicitlyAllowedTestBranch =
      process.env.ALLOW_ISOLATED_TEST_DB === 'true' &&
      target.toLowerCase().includes('test');

    if (!isLocalSafeTarget(target) && !isExplicitlyAllowedTestBranch) {
      throw new UnsafeDatabaseTargetError(
        target.replace(/:[^@]+@/, ':***@'),
        'Integration tests must run against an authorized isolated test database (e.g. localhost/test_db or an ephemeral test branch with ALLOW_ISOLATED_TEST_DB=true).'
      );
    }
  }

  // 3. Migration safety check
  if (context === 'migration') {
    if (isTestEnv) {
      throw new MigrationInTestEnvironmentError();
    }
  }
}
