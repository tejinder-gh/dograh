import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import { getServerBackendUrl } from '@/lib/apiClient';
import { OSS_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { getServerAccessToken } from '@/lib/auth/server';
import {
  createInternalAssertion,
  KNOWN_INSECURE_SECRETS,
} from '@/lib/businessAssertion';

export interface VerifiedAcuitySession {
  userId: string;
  email: string;
  organizationId: number;
}
export type VerifiedAcuitySession = VerifiedAcuitySession;

// Startup / initialization environment validation
function validateConfiguration(): { apiUrl: string; secret: string; deploymentId: string } {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.BUSINESS_EXT_SECRET;
  const apiUrl = process.env.BUSINESS_API_URL;
  const deploymentId = process.env.ACUITY_DEPLOYMENT_ID || process.env.Acuity_DEPLOYMENT_ID || 'default';

  if (isProd) {
    if (!secret || secret.length < 32 || KNOWN_INSECURE_SECRETS.has(secret)) {
      throw new Error(
        'Fatal configuration error: BUSINESS_EXT_SECRET must be explicitly configured with at least 32 characters in production'
      );
    }
    if (!apiUrl) {
      throw new Error(
        'Fatal configuration error: BUSINESS_API_URL must be explicitly configured in production (no localhost fallback permitted)'
      );
    }
  }

  return {
    apiUrl: apiUrl || (isProd ? '' : 'http://127.0.0.1:4000'),
    secret: secret || '',
    deploymentId,
  };
}

const config = validateConfiguration();

function getBusinessExtSecret(): string {
  const secret = process.env.BUSINESS_EXT_SECRET || config.secret;
  if (!secret || secret.length < 32 || KNOWN_INSECURE_SECRETS.has(secret)) {
    throw new Error(
      'Fatal: BUSINESS_EXT_SECRET is not configured with a secure high-entropy value (min 32 chars)'
    );
  }
  return secret;
}

function getBusinessApiUrl(): string {
  const url = process.env.BUSINESS_API_URL || config.apiUrl;
  if (!url) {
    throw new Error('Fatal: BUSINESS_API_URL is not configured');
  }
  return url;
}

/**
 * Authoritatively verifies Acuity identity against the Acuity core backend.
 * Never treats unverified cookie claims (such as OSS_USER) as authorization evidence.
 */
export async function getVerifiedSession(
  req?: Request | NextRequest
): Promise<VerifiedAcuitySession | null> {
  let token: string | null = null;

  // 1. Check for Bearer token in incoming Request Authorization header
  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  // 2. Check for cookie on NextRequest if present
  if (!token && req && 'cookies' in req) {
    const nextReq = req as NextRequest;
    token = nextReq.cookies.get(OSS_TOKEN_COOKIE)?.value || null;
  }

  // 3. Check for cookie header on standard Request
  if (!token && req) {
    const cookieHeader = req.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${OSS_TOKEN_COOKIE}=([^;]*)`));
      if (match && match[1]) {
        token = decodeURIComponent(match[1]);
      }
    }
  }

  // 4. Fallback to server cookie store if available
  if (!token) {
    try {
      token = await getServerAccessToken();
    } catch {
      token = null;
    }
  }

  if (!token && !req) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(OSS_TOKEN_COOKIE)?.value || null;
    } catch {
      token = null;
    }
  }

  // Fail closed if no access token is available
  if (!token) {
    return null;
  }

  // 5. Authoritatively validate the token against Acuity's /api/v1/auth/me
  try {
    const backendUrl = getServerBackendUrl();
    const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (
      data &&
      typeof data.organization_id === 'number' &&
      data.organization_id > 0 &&
      data.id
    ) {
      return {
        userId: String(data.id),
        email: String(data.email || ''),
        organizationId: data.organization_id,
      };
    }

    return null;
  } catch (err) {
    console.error('Failed to verify session against Acuity /api/v1/auth/me:', err);
    return null;
  }
}

/**
 * Resolves verified Acuity organization ID. Never trusts client cookie parameters.
 */
export async function getAuthenticatedOrgId(req?: Request | NextRequest): Promise<number | null> {
  const session = await getVerifiedSession(req);
  return session ? session.organizationId : null;
}

/**
 * Proxies request to the Business Extension API using a short-lived,
 * cryptographically signed and request-bound internal service assertion.
 */
export async function callBusinessApi(
  path: string,
  options: RequestInit = {},
  req?: Request | NextRequest
): Promise<Response> {
  const session = await getVerifiedSession(req);
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: Session invalid, expired, or missing active organization' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const method = (options.method || 'GET').toUpperCase();
  const bodyStr = typeof options.body === 'string' ? options.body : '';

  let assertion: string;
  try {
    const secret = getBusinessExtSecret();
    const deploymentId = process.env.ACUITY_DEPLOYMENT_ID || process.env.Acuity_DEPLOYMENT_ID || config.deploymentId;
    assertion = createInternalAssertion({
      userId: session.userId,
      orgId: session.organizationId,
      deploymentId,
      secret,
      method,
      path: normalizedPath,
      body: bodyStr,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal assertion error';
    return new Response(
      JSON.stringify({ error: `Security configuration error: ${msg}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const headers = new Headers(options.headers || {});
  // Strip any caller-supplied spoofed headers
  headers.delete('X-Acuity-Organization-Id');
  headers.delete('X-Acuity-Deployment-Id');
  headers.delete('X-Acuity-Organization-Id');
  headers.delete('X-Acuity-Deployment-Id');
  headers.delete('X-Extension-Secret');

  // Attach verified internal assertion with cryptographic request binding
  headers.set('X-Internal-Assertion', assertion);

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const baseUrl = getBusinessApiUrl();
  const url = `${baseUrl}${normalizedPath}`;

  try {
    return await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Business extension service unreachable';
    return new Response(
      JSON.stringify({ error: `Business service request failed: ${message}` }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
