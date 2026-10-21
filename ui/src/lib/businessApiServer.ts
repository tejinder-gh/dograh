import { getServerBackendUrl } from '@/lib/apiClient';
import { getServerAccessToken,getServerUser } from '@/lib/auth/server';

const BUSINESS_API_URL = process.env.BUSINESS_API_URL || 'http://127.0.0.1:4000';
const BUSINESS_EXT_SECRET = process.env.BUSINESS_EXT_SECRET || 'business-extension-local-secret-change-in-prod';

/**
 * Resolves the verified Dograh organization ID for the active server session.
 * Never trusts client-supplied organization parameters.
 */
export async function getAuthenticatedOrgId(): Promise<number | null> {
  const user = await getServerUser();
  if (!user) return null;

  // Check direct organizationId property
  if ('organizationId' in user && user.organizationId) {
    const raw = String(user.organizationId).replace(/^org_/, '');
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // Fallback: Verify identity directly against Dograh backend /auth/me
  const token = await getServerAccessToken();
  if (!token) return null;

  try {
    const backendUrl = getServerBackendUrl();
    const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.organization_id && typeof data.organization_id === 'number') {
      return data.organization_id;
    }
  } catch (err) {
    console.error('Failed to resolve organization from Dograh /auth/me:', err);
  }

  return null;
}

/**
 * Proxies request to the Business Extension API with verified server-side credentials.
 */
export async function callBusinessApi(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const orgId = await getAuthenticatedOrgId();
  if (!orgId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: No active organization session found' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const headers = new Headers(options.headers || {});
  headers.set('X-Dograh-Organization-Id', String(orgId));
  headers.set('X-Extension-Secret', BUSINESS_EXT_SECRET);

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${BUSINESS_API_URL}${normalizedPath}`;

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
