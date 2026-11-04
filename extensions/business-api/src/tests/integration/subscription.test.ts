import { describe, it, expect, beforeAll } from 'bun:test';
import { createApp } from '../../app';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { adminQuery } from '../test-admin';
import { env } from '../../config/env';
import { createInternalAssertion } from '../../config/signed-assertion';
import type {
  ClientSubscriptionOverview,
  AdminClientAccountRow,
  SubscriptionPlan,
} from '../../domain/subscription.types';

describe('Multi-Tenant Subscription & Admin Account Control Boundary', () => {
  const app = createApp();
  const validSecret = env.BUSINESS_EXT_SECRET;
  const deploymentId = env.ACUITY_DEPLOYMENT_ID || 'default';

  const testOrgId = 701;
  const testUserId = '701';

  beforeAll(async () => {
    await runMigrations();

    // Ensure mapping exists
    const mappingRes = await query<{ business_tenant_id: string }>(`
      SELECT business_tenant_id 
      FROM business_ext.organization_mappings 
      WHERE acuity_organization_id = $1
    `, [testOrgId]);

    let tenantId = mappingRes.rows[0]?.business_tenant_id;
    if (!tenantId) {
      const inserted = await query<{ business_tenant_id: string }>(`
        INSERT INTO business_ext.organization_mappings (acuity_organization_id, deployment_id)
        VALUES ($1, $2)
        RETURNING business_tenant_id
      `, [testOrgId, deploymentId]);
      tenantId = inserted.rows[0]?.business_tenant_id;
    }

    // Reset / Seed default subscription
    if (tenantId) {
      await query(`
        INSERT INTO business_ext.organization_subscriptions
        (tenant_id, plan_id, status, included_minutes, bonus_minutes, concurrency_limit)
        VALUES ($1, 'starter', 'active', 250, 0, 2)
        ON CONFLICT (tenant_id) DO UPDATE SET
          plan_id = 'starter',
          status = 'active',
          included_minutes = 250,
          bonus_minutes = 0,
          concurrency_limit = 2
      `, [tenantId]);
    }
  });

  it('allows verified client to fetch their own subscription overview and quota meter', async () => {
    const path = '/api/subscription';
    const assertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
      isPlatformAdmin: false,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': assertion },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as ClientSubscriptionOverview;
    expect(data.plan).toBeDefined();
    expect(data.plan.id).toBe('starter');
    expect(data.status).toBe('active');
    expect(data.totalAllocatedMinutes).toBeGreaterThanOrEqual(250);
    expect(data.concurrencyLimit).toBeGreaterThanOrEqual(2);
    expect(data.availablePlans.length).toBeGreaterThanOrEqual(3);
  });

  it('allows client to list public active subscription tiers', async () => {
    const path = '/api/subscription/plans';
    const assertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
      isPlatformAdmin: false,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': assertion },
    });

    expect(res.status).toBe(200);
    const plans = (await res.json()) as SubscriptionPlan[];
    expect(Array.isArray(plans)).toBe(true);
    const ids = plans.map((p) => p.id);
    expect(ids).toContain('starter');
    expect(ids).toContain('professional');
    expect(ids).toContain('enterprise');
  });

  it('strictly forbids regular non-superuser from accessing platform admin accounts (403)', async () => {
    const path = '/api/admin/accounts';
    const assertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
      isPlatformAdmin: false,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': assertion },
    });

    expect(res.status).toBe(403);
    const err = (await res.json()) as { error?: string };
    expect(err.error).toContain('Forbidden');
  });

  it('allows verified platform administrator to list all client accounts with economics', async () => {
    const path = '/api/admin/accounts';
    const assertion = createInternalAssertion({
      userId: '1',
      orgId: 1,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
      isPlatformAdmin: true,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': assertion },
    });

    expect(res.status).toBe(200);
    const accounts = (await res.json()) as AdminClientAccountRow[];
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThanOrEqual(1);

    const client701 = accounts.find((a) => a.organizationId === testOrgId);
    expect(client701).toBeDefined();
    expect(client701?.planId).toBeDefined();
    expect(client701?.totalAllocatedMinutes).toBeGreaterThanOrEqual(250);
  });

  it('allows verified platform administrator to upgrade client plan and record audit log', async () => {
    const mappingRes = await query<{ business_tenant_id: string }>(`
      SELECT business_tenant_id 
      FROM business_ext.organization_mappings 
      WHERE acuity_organization_id = $1
    `, [testOrgId]);
    const tenantId = mappingRes.rows[0]?.business_tenant_id;
    expect(tenantId).toBeDefined();

    const path = `/api/admin/accounts/${tenantId}/subscription`;
    const payload = JSON.stringify({
      planId: 'professional',
      bonusMinutesDelta: 50,
      reason: 'Upgraded client account via Staff Engineer admin workflow',
    });

    const assertion = createInternalAssertion({
      userId: '1',
      orgId: 1,
      deploymentId,
      secret: validSecret,
      method: 'PATCH',
      path,
      body: payload,
      isPlatformAdmin: true,
    });

    const res = await app.request(path, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as ClientSubscriptionOverview;
    expect(updated.plan.id).toBe('professional');
    expect(updated.bonusMinutes).toBeGreaterThanOrEqual(50);
    expect(updated.totalAllocatedMinutes).toBe(1050); // 1000 included + 50 bonus

    // Verify audit log exists
    const logs = await query(`
      SELECT action, reason, previous_state, new_state 
      FROM business_ext.account_control_logs
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [tenantId]);

    expect(logs.rows.length).toBe(1);
    const firstLog = logs.rows[0];
    expect(firstLog).toBeDefined();
    expect(firstLog?.action).toBe('admin_update_subscription');
    expect(firstLog?.reason).toContain('Upgraded client account');
  });

  it('strictly rejects customer self-service upgrade without payment verification (402)', async () => {
    const path = '/api/subscription/upgrade';
    const payload = JSON.stringify({ planId: 'enterprise' }); // No payment transaction ID!
    const assertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'POST',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(402);
  });

  it('strictly rejects customer self-service top-up without payment verification (402)', async () => {
    const path = '/api/subscription/topup';
    const payload = JSON.stringify({ minutes: 500 }); // No payment transaction ID!
    const assertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'POST',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(402);
  });

  it('allows verified client to self-service upgrade their plan (BIL-02)', async () => {
    const path = '/api/subscription/upgrade';
    const payload = JSON.stringify({
      planId: 'enterprise',
      paymentTransactionId: 'pi_test_stripe_upgrade_12345',
    });
    const assertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'POST',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as ClientSubscriptionOverview;
    expect(updated.plan.id).toBe('enterprise');
    expect(updated.includedMinutes).toBe(3500);
    expect(updated.concurrencyLimit).toBe(20);
  });

  it('allows verified client to self-service top up voice minutes (BIL-01)', async () => {
    const path = '/api/subscription/topup';
    const payload = JSON.stringify({
      minutes: 250,
      paymentTransactionId: 'pi_test_stripe_topup_67890',
      notes: 'Self-serve top up test',
    });
    const assertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'POST',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as ClientSubscriptionOverview;
    expect(updated.bonusMinutes).toBeGreaterThanOrEqual(250);
  });
});
