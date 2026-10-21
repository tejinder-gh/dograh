/**
 * Client-Side Tenant Authentication & Session Helper
 * Standardizes signed token storage, tenant context headers, and session bootstrapping.
 */

export const TOKEN_STORAGE_KEY = 'ai_calling_token';
export const TENANT_STORAGE_KEY = 'ai_calling_tenant_id';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getTenantId(): string {
  if (typeof window === 'undefined') return 'default-enterprise';
  return localStorage.getItem(TENANT_STORAGE_KEY) || 'default-enterprise';
}

export function setAuthSession(token: string, tenantId?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  if (tenantId) {
    localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
  }
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TENANT_STORAGE_KEY);
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  const tenantId = getTenantId();

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    ...(extra || {}),
  };
}

export async function ensureAuthSession(params?: {
  email?: string;
  idToken?: string;
  tenantId?: string;
}): Promise<string | null> {
  const existing = getAuthToken();
  if (existing) return existing;

  if (!params?.idToken) {
    // Cannot establish session without verified cryptographic identity token
    return null;
  }

  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email,
        idToken: params.idToken,
        tenantId: params.tenantId || getTenantId(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        setAuthSession(data.token, data.tenant?.id);
        return data.token;
      }
    }
  } catch (err) {
    console.warn('[AUTH CLIENT] Session authentication failed:', err);
  }

  return null;
}

