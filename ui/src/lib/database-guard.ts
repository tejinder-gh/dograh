/**
 * Database Target Safety Guard (Next.js UI Suite)
 * 
 * Strict enforcement to prevent Next.js route tests or helper scripts from
 * executing queries or migrations against the production Neon database.
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

const PRODUCTION_HOST_PATTERNS = [
  'ep-wispy-truth-b5kkygdq',
  'br-twilight-base-b51aowww',
  'b5kkygdq',
  'b51aowww',
  'wispy-truth',
  'twilight-base',
  'ai_calling_owner',
];

const LOCAL_SAFE_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres', '::1']);

export function normalizeTargetString(connectionStringOrHost?: string): string {
  if (!connectionStringOrHost) return '';
  let str = connectionStringOrHost.trim().toLowerCase();
  try {
    str = decodeURIComponent(str);
  } catch {
    // Keep trimmed lowercase if decode fails
  }
  return str;
}

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
    const match = trimmed.match(/@([^/:?]+)/);
    return match ? match[1]!.toLowerCase() : '';
  }
}

export function isProductionDatabaseTarget(connectionStringOrHost?: string): boolean {
  if (!connectionStringOrHost) return false;
  const normalized = normalizeTargetString(connectionStringOrHost);
  
  if (PRODUCTION_HOST_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }
  if (normalized.includes('neon.tech') && normalized.includes('ai_calling_os')) {
    if (!normalized.includes('test') && !normalized.includes('staging')) {
      return true;
    }
  }
  return false;
}

export function isLocalSafeTarget(connectionStringOrHost?: string): boolean {
  if (!connectionStringOrHost) return false;
  const host = extractDatabaseHost(connectionStringOrHost);
  return LOCAL_SAFE_HOSTS.has(host);
}

export function assertSafeDatabaseTarget(
  targetUrlOrHost: string | undefined,
  context: 'runtime' | 'test' = 'test'
): void {
  const target = targetUrlOrHost || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';

  if (!target) {
    throw new UnsafeDatabaseTargetError(
      'EMPTY_TARGET',
      'Database target connection string is required for test queries.'
    );
  }

  // 1. Production target check
  if (isProductionDatabaseTarget(target)) {
    throw new ProductionDatabaseTargetError(
      target.replace(/:[^@]+@/, ':***@'),
      'Automated test execution against the production Neon database branch is strictly blocked under all circumstances.'
    );
  }

  // 2. Local or explicitly approved isolated test branch check
  const isExplicitlyAllowedTestBranch =
    process.env.ALLOW_ISOLATED_TEST_DB === 'true' &&
    !isProductionDatabaseTarget(target) &&
    target.toLowerCase().includes('test');

  if (!isLocalSafeTarget(target) && !isExplicitlyAllowedTestBranch) {
    throw new UnsafeDatabaseTargetError(
      target.replace(/:[^@]+@/, ':***@'),
      'Integration tests must run against an authorized isolated test database (e.g. localhost or ephemeral branch with ALLOW_ISOLATED_TEST_DB=true).'
    );
  }
}
