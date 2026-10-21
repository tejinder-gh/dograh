import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { query, withSystemContext, withTenantContext } from '../db/connection';

export type UserRole =
  | 'platform_super_admin'
  | 'platform_operations'
  | 'tenant_owner'
  | 'tenant_administrator'
  | 'tenant_agent_manager'
  | 'tenant_staff'
  | 'tenant_analyst';

export interface AuthTokenClaims {
  userId: string;
  tenantId?: string;
  role?: UserRole;
  isPlatformAdmin?: boolean;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
      userRole?: UserRole;
      isPlatformAdmin?: boolean;
    }
  }
}

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

export const TOKEN_ISSUER = 'ai-calling-agent-os';
export const TOKEN_AUDIENCE = 'ai-calling-agent-os-client';

let runtimeAuthSecret: string | null = null;

/**
 * Returns the configured high-entropy auth secret.
 * In production, strictly requires AUTH_SECRET >= 32 chars.
 * In development/test, generates a secure random 256-bit secret per process boot.
 */
export function getAuthSecret(): string {
  if (runtimeAuthSecret) return runtimeAuthSecret;

  const envSecret = process.env.AUTH_SECRET || process.env.JWT_SECRET;
  if (envSecret && envSecret.trim().length >= 32) {
    runtimeAuthSecret = envSecret.trim();
    return runtimeAuthSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new AuthConfigurationError(
      '[FATAL AUTH SECURITY] AUTH_SECRET environment variable is missing or shorter than 32 characters in production. ' +
      'A high-entropy secret must be configured to secure tenant authentication.'
    );
  }

  // Generate ephemeral 256-bit cryptographically secure secret (never predictable or static)
  runtimeAuthSecret = crypto.randomBytes(32).toString('hex');
  return runtimeAuthSecret;
}

export function setAuthSecretForTesting(secret: string | null): void {
  runtimeAuthSecret = secret;
}

/**
 * Validates the authentication configuration at application startup.
 * Strictly verifies high-entropy secret presence in production.
 */
export function validateAuthEnvironment(): { secretConfigured: boolean; isProduction: boolean } {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = getAuthSecret();
  if (isProd && (!secret || secret.length < 32)) {
    throw new AuthConfigurationError(
      '[FATAL AUTH SECURITY] AUTH_SECRET environment variable is missing or shorter than 32 characters in production. ' +
      'A high-entropy secret must be configured to secure tenant authentication.'
    );
  }
  return { secretConfigured: !!secret, isProduction: isProd };
}

/**
 * Generates an HMAC-SHA256 signed bearer token with structured claims,
 * mandatory expiration, and standard issuer/audience claims.
 */
export function createSignedToken(
  claims: AuthTokenClaims,
  expiresInSeconds: number = 86400
): string {
  const secret = getAuthSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const exp = claims.exp !== undefined ? claims.exp : now + expiresInSeconds;
  
  const payloadObj: AuthTokenClaims = {
    ...claims,
    iss: claims.iss || TOKEN_ISSUER,
    aud: claims.aud || TOKEN_AUDIENCE,
    iat: claims.iat || now,
    exp,
  };

  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Cryptographically verifies token signature, tamper-resistance,
 * mandatory alg/typ headers, rational iat/exp bounds, and unconditional
 * audience/issuer claims.
 */
export function verifySignedToken(token: string): AuthTokenClaims | null {
  try {
    const secret = getAuthSecret();
    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    if (!header || !payload || !signature) return null;

    // 1. Enforce strict alg and typ header checks
    const headerObj = JSON.parse(Buffer.from(header, 'base64url').toString('utf-8'));
    if (headerObj.alg !== 'HS256' || headerObj.typ !== 'JWT') {
      return null;
    }

    // 2. Cryptographic signature check with constant-time comparison
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as AuthTokenClaims;
    
    // 3. Mandatory numeric exp and iat checks
    if (typeof claims.exp !== 'number' || isNaN(claims.exp)) {
      return null;
    }
    if (typeof claims.iat !== 'number' || isNaN(claims.iat)) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    // Allow up to 60 seconds clock skew for iat, but reject future tokens beyond that
    if (claims.iat > now + 60) {
      return null;
    }
    if (claims.exp <= now || claims.exp <= claims.iat) {
      return null; // Expired or irrational token lifetime
    }

    // 4. Unconditional Issuer & Audience validation (must be present and exact)
    if (!claims.iss || claims.iss !== TOKEN_ISSUER) {
      return null;
    }
    if (!claims.aud || claims.aud !== TOKEN_AUDIENCE) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

/**
 * Extracts and strictly validates tenant context and caller authentication.
 *
 * Requirements:
 * 1. Deny by default (401 for unauthenticated requests).
 * 2. Cryptographically verify signed token claims; caller cannot forge user or tenant IDs.
 * 3. Enforce user active status and tenant membership in PostgreSQL.
 * 4. Server-side authorization of platform administrator privileges (never trust client claim).
 * 5. Deny access (403) if tenant is suspended, user is revoked, or lacks membership.
 */
export async function requireTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Extract Bearer token from Authorization header or API key header
    const authHeader = req.headers['authorization'];
    let rawToken: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.substring(7).trim();
    } else if (req.headers['x-api-key']) {
      rawToken = req.headers['x-api-key'] as string;
    }

    if (!rawToken) {
      res.status(401).json({
        error: 'Authentication required. Missing Bearer token or authorization credentials.',
        code: 'UNAUTHENTICATED',
      });
      return;
    }

    // 2. Cryptographically verify the token
    const claims = verifySignedToken(rawToken);
    if (!claims || !claims.userId) {
      res.status(401).json({
        error: 'Invalid, malformed, or expired authentication token.',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    // 3. Determine target tenant ID (from header, query, or verified claim)
    const headerTenant = req.headers['x-tenant-id'] as string | undefined;
    const queryTenant = req.query.tenantId as string | undefined;
    const requestedTenantId = (headerTenant || queryTenant || claims.tenantId || '').trim();

    if (!requestedTenantId) {
      res.status(400).json({
        error: 'Tenant context required. Please supply x-tenant-id header.',
        code: 'TENANT_REQUIRED',
      });
      return;
    }

    // 4. Verify tenant exists in database and is active
    const tenantResult = await withSystemContext(async (client) => {
      return client.query<{ id: string; name: string; status: string }>(
        'SELECT id, name, status FROM tenants WHERE id = $1 OR slug = $1',
        [requestedTenantId]
      );
    });

    if (tenantResult.rows.length === 0) {
      res.status(404).json({
        error: `Tenant "${requestedTenantId}" not found.`,
        code: 'INVALID_TENANT_ID',
      });
      return;
    }

    const tenant = tenantResult.rows[0];
    if (tenant.status === 'suspended') {
      res.status(403).json({
        error: 'Tenant organization is suspended. Please contact platform operations.',
        code: 'TENANT_SUSPENDED',
      });
      return;
    }

    // 5. Verify user exists and is active (revoked/disabled check)
    const userCheck = await withSystemContext(async (client) => {
      return client.query<{ is_platform_admin: boolean; is_active: boolean }>(
        'SELECT is_platform_admin, is_active FROM users WHERE id = $1',
        [claims.userId]
      );
    });

    if (userCheck.rows.length > 0 && !userCheck.rows[0].is_active) {
      res.status(403).json({
        error: 'User account has been disabled or revoked.',
        code: 'ACCOUNT_DISABLED',
      });
      return;
    }

    const isPlatformAdminInDb = userCheck.rows.length > 0 && !!userCheck.rows[0].is_platform_admin;

    // Server-side authorization of platform administration: only grant if verified in DB
    if (isPlatformAdminInDb) {
      req.userId = claims.userId;
      req.tenantId = tenant.id;
      req.userRole = 'platform_super_admin';
      req.isPlatformAdmin = true;
      next();
      return;
    }

    // Reject callers attempting to forge platform-admin claims in token
    if (claims.isPlatformAdmin) {
      res.status(403).json({
        error: 'Platform administrator privileges not authorized for this account.',
        code: 'FORBIDDEN_PLATFORM_ADMIN',
      });
      return;
    }

    // 6. Verify user membership and role in this tenant organization under strict RLS
    const memberResult = await withTenantContext(tenant.id, claims.userId, async (client) => {
      return client.query<{ role: string; status: string }>(
        'SELECT role, status FROM tenant_users WHERE tenant_id = $1 AND user_id = $2',
        [tenant.id, claims.userId]
      );
    });

    if (memberResult.rows.length === 0 || memberResult.rows[0].status === 'suspended') {
      res.status(403).json({
        error: 'User is not an authorized active member of this tenant organization.',
        code: 'FORBIDDEN_TENANT_MEMBERSHIP',
      });
      return;
    }

    // Authorized membership confirmed
    req.userId = claims.userId;
    req.tenantId = tenant.id;
    req.userRole = memberResult.rows[0].role as UserRole;
    req.isPlatformAdmin = false;

    next();
  } catch (err: unknown) {
    console.error('[AUTH MIDDLEWARE ERROR] Tenant resolution failed:', err);
    res.status(500).json({ error: 'Failed to resolve tenant authorization context' });
  }
}

/**
 * Role-Based Access Control gate.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      res.status(401).json({
        error: 'Unauthenticated or missing role context',
        code: 'UNAUTHENTICATED',
      });
      return;
    }

    if (req.userRole === 'platform_super_admin' || allowedRoles.includes(req.userRole)) {
      next();
      return;
    }

    res.status(403).json({
      error: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]. Current role: ${req.userRole}`,
      code: 'INSUFFICIENT_ROLE_PERMISSIONS',
    });
  };
}
