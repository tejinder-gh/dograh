import { describe, it, expect, beforeAll } from 'bun:test';
import { createApp } from '../../app';
import { query } from '../../config/database';
import { adminQuery } from '../test-admin';
import { env } from '../../config/env';
import { createInternalAssertion } from '../../config/signed-assertion';

describe('Tenant Isolation & Account Suspension Enforcement (TEN-01)', () => {
  const app = createApp();
  const validSecret = env.BUSINESS_EXT_SECRET;
  const deploymentId = env.ACUITY_DEPLOYMENT_ID || 'default';

  const activeOrgId = 801;
  const activeUserId = '801';
  let activeTenantId: string;

  const pausedOrgId = 802;
  const pausedUserId = '802';
  let pausedTenantId: string;

  beforeAll(async () => {
    // 0. Seed Acuity authoritative tables via adminQuery
    await adminQuery(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (801, 'org_test_801'), (802, 'org_test_802')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.users (id, email, provider_id)
      VALUES (801, 'user801@example.com', 'user_test_801'),
             (802, 'user802@example.com', 'user_test_802')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

      INSERT INTO public.organization_users (user_id, organization_id)
      VALUES (801, 801), (802, 802)
      ON CONFLICT (user_id, organization_id) DO NOTHING;
    `);

    // 1. Setup Active Org 801
    const activeMapping = await query<{ business_tenant_id: string }>(
      `INSERT INTO business_ext.organization_mappings (acuity_organization_id, deployment_id)
       VALUES ($1, $2)
       ON CONFLICT (deployment_id, acuity_organization_id) DO UPDATE SET deployment_id = EXCLUDED.deployment_id
       RETURNING business_tenant_id`,
      [activeOrgId, deploymentId]
    );
    activeTenantId = activeMapping.rows[0]!.business_tenant_id;

    await query(
      `INSERT INTO business_ext.organization_subscriptions
       (tenant_id, plan_id, status, included_minutes, concurrency_limit)
       VALUES ($1, 'professional', 'active', 1000, 5)
       ON CONFLICT (tenant_id) DO UPDATE SET status = 'active'`,
      [activeTenantId]
    );

    // 2. Setup Paused Org 802
    const pausedMapping = await query<{ business_tenant_id: string }>(
      `INSERT INTO business_ext.organization_mappings (acuity_organization_id, deployment_id)
       VALUES ($1, $2)
       ON CONFLICT (deployment_id, acuity_organization_id) DO UPDATE SET deployment_id = EXCLUDED.deployment_id
       RETURNING business_tenant_id`,
      [pausedOrgId, deploymentId]
    );
    pausedTenantId = pausedMapping.rows[0]!.business_tenant_id;

    await query(
      `INSERT INTO business_ext.organization_subscriptions
       (tenant_id, plan_id, status, included_minutes, concurrency_limit)
       VALUES ($1, 'starter', 'paused', 250, 2)
       ON CONFLICT (tenant_id) DO UPDATE SET status = 'paused'`,
      [pausedTenantId]
    );
  });

  it('allows active organization to access CRM contacts', async () => {
    const path = '/api/contacts';
    const assertion = createInternalAssertion({
      userId: activeUserId,
      orgId: activeOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': assertion,
      },
    });

    expect(res.status).toBe(200);
  });

  it('prohibits paused organization from accessing CRM contacts (403 Forbidden)', async () => {
    const path = '/api/contacts';
    const assertion = createInternalAssertion({
      userId: pausedUserId,
      orgId: pausedOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': assertion,
      },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; status: string };
    expect(body.error).toContain('Forbidden: Organization subscription is paused');
    expect(body.status).toBe('paused');
  });

  it('prohibits paused organization from creating CRM contacts (403 Forbidden)', async () => {
    const path = '/api/contacts';
    const payload = JSON.stringify({
      name: 'Blocked Lead',
      email: 'blocked@example.com',
      phone: '+15551234567',
    });

    const assertion = createInternalAssertion({
      userId: pausedUserId,
      orgId: pausedOrgId,
      deploymentId,
      secret: validSecret,
      method: 'POST',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertion,
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Forbidden: Organization subscription is paused');
  });

  it('allows paused organization to read subscription overview for reactivation', async () => {
    const path = '/api/subscription';
    const assertion = createInternalAssertion({
      userId: pausedUserId,
      orgId: pausedOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': assertion,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('paused');
  });

  it('allows platform administrator to access resources even when tenant is paused', async () => {
    const path = `/api/contacts`;
    // Platform admin asserts with isPlatformAdmin: true
    const assertion = createInternalAssertion({
      userId: 'platform-admin',
      orgId: pausedOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
      isPlatformAdmin: true,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': assertion,
      },
    });

    expect(res.status).toBe(200);
  });
});
