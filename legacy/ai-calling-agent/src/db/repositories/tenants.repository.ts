import { withSystemContext, withTenantContext } from '../connection';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  status: 'active' | 'suspended' | 'trial' | 'pending_onboarding';
  tier: 'starter' | 'standard' | 'growth' | 'enterprise';
  created_at: string;
  updated_at: string;
}

export async function getAllTenants(): Promise<Tenant[]> {
  return withSystemContext(async (client) => {
    const res = await client.query<Tenant>(
      'SELECT * FROM tenants ORDER BY created_at DESC'
    );
    return res.rows;
  });
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  return withTenantContext(id, undefined, async (client) => {
    const res = await client.query<Tenant>(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  });
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  return withSystemContext(async (client) => {
    const res = await client.query<Tenant>(
      'SELECT * FROM tenants WHERE slug = $1',
      [slug]
    );
    return res.rows[0] || null;
  });
}

export async function createTenant(data: {
  name: string;
  slug: string;
  industry?: string;
  tier?: Tenant['tier'];
}): Promise<Tenant> {
  return withSystemContext(async (client) => {
    const res = await client.query<Tenant>(
      `INSERT INTO tenants (name, slug, industry, tier, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
      [
        data.name,
        data.slug,
        data.industry || 'general',
        data.tier || 'standard',
      ]
    );
    return res.rows[0];
  });
}

/**
 * Ensures at least one default organization tenant exists for initial startup.
 */
export async function ensureDefaultTenant(): Promise<Tenant> {
  return withSystemContext(async (client) => {
    const existing = await client.query<Tenant>(
      'SELECT * FROM tenants WHERE slug = $1 LIMIT 1',
      ['default-enterprise']
    );
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const created = await client.query<Tenant>(
      `INSERT INTO tenants (name, slug, industry, tier, status)
       VALUES ('Default Enterprise Tenant', 'default-enterprise', 'Technology', 'enterprise', 'active')
       RETURNING *`
    );
    return created.rows[0];
  });
}
