import { describe, it, expect, beforeAll } from 'bun:test';
import { createApp } from '../../app';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { adminQuery } from '../test-admin';
import { env } from '../../config/env';
import { createInternalAssertion } from '../../config/signed-assertion';
import type {
  ClientOverviewDashboardData,
  PlatformOverviewDashboardData,
} from '../../domain/analytics.types';

describe('Analytics & Platform Command Authorization Boundary', () => {
  const app = createApp();
  const validSecret = env.BUSINESS_EXT_SECRET;
  const deploymentId = env.ACUITY_DEPLOYMENT_ID || 'default';

  const testOrgId = 701;
  const testUserId = '701';

  beforeAll(async () => {
    await runMigrations();

    // Clean up stale test data
    await query('DELETE FROM business_ext.organization_mappings WHERE acuity_organization_id = $1', [testOrgId]);
    await adminQuery('DELETE FROM public.workflow_runs WHERE workflow_id IN (SELECT id FROM public.workflows WHERE organization_id = $1)', [testOrgId]);
    await adminQuery('DELETE FROM public.workflow_definitions WHERE workflow_id IN (SELECT id FROM public.workflows WHERE organization_id = $1)', [testOrgId]);
    await adminQuery('DELETE FROM public.workflows WHERE organization_id = $1', [testOrgId]);
    await adminQuery('DELETE FROM public.organization_users WHERE user_id = $1', [Number(testUserId)]);
    await adminQuery('DELETE FROM public.users WHERE id = $1', [Number(testUserId)]);
    await adminQuery('DELETE FROM public.organizations WHERE id = $1', [testOrgId]);

    // Seed test org & user
    await adminQuery(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (701, 'org_analytics_701')
      ON CONFLICT (id) DO NOTHING;
    `);

    await adminQuery(`
      INSERT INTO public.users (id, email, provider_id)
      VALUES (701, 'analytics_user701@example.com', 'user_analytics_701')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

      INSERT INTO public.organization_users (user_id, organization_id)
      VALUES (701, 701)
      ON CONFLICT (user_id, organization_id) DO NOTHING;
    `);

    // Seed sample workflow and runs
    const wfRes = await adminQuery<{ id: number }>(`
      INSERT INTO public.workflows (
        organization_id, name, workflow_definition, template_context_variables,
        call_disposition_codes, workflow_configurations, workflow_uuid
      ) VALUES (
        701, 'Analytics Test Agent', '{}', '{}',
        '[]', '{}', gen_random_uuid()::text
      ) RETURNING id;
    `);
    const wfId = wfRes.rows[0]?.id;

    if (wfId) {
      await adminQuery(`
        INSERT INTO public.workflow_runs (
          workflow_id, name, mode, state, call_type, is_completed, usage_info, cost_info,
          initial_context, gathered_context, annotations, created_at
        ) VALUES
        (${wfId}, 'Test Run 1', 'telephony', 'completed', 'inbound', true, '{"call_duration_seconds": 120}', '{"total_cost_usd": 0.05}', '{}', '{}', '{}', NOW()),
        (${wfId}, 'Test Run 2', 'telephony', 'running', 'outbound', false, '{"call_duration_seconds": 0}', '{"total_cost_usd": 0.01}', '{}', '{}', '{}', NOW());
      `);
    }
  });

  it('allows verified client to access their own client analytics overview', async () => {
    const path = '/api/analytics/overview';
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
    const data = (await res.json()) as ClientOverviewDashboardData;
    expect(data.kpis).toBeDefined();
    expect(data.kpis.totalCalls).toBeDefined();
    expect(data.kpis.totalCalls.value).toBeGreaterThanOrEqual(1);
    expect(data.kpis.answeredCalls.value).toBeGreaterThanOrEqual(1);
    expect(data.callVolumeSeries).toBeDefined();
    expect(data.dispositions).toBeDefined();
  });

  it('allows client to download their analytics CSV export', async () => {
    const path = '/api/analytics/export';
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
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text).toContain('Total Calls');
    expect(text).toContain('Answered Calls');
  });

  it('prohibits non-admin client from accessing platform admin analytics overview (403 Forbidden)', async () => {
    const path = '/api/admin/analytics/overview';
    const nonAdminAssertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
      isPlatformAdmin: false, // Standard client / org admin, not platform admin
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': nonAdminAssertion },
    });

    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Platform administrator privileges required');
  });

  it('prohibits non-admin client from exporting platform portfolio CSV (403 Forbidden)', async () => {
    const path = '/api/admin/analytics/export';
    const nonAdminAssertion = createInternalAssertion({
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
      headers: { 'X-Internal-Assertion': nonAdminAssertion },
    });

    expect(res.status).toBe(403);
  });

  it('allows verified platform administrator to access platform command center overview', async () => {
    const path = '/api/admin/analytics/overview';
    const adminAssertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
      isPlatformAdmin: true, // Explicit platform superuser
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': adminAssertion },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as PlatformOverviewDashboardData;
    expect(data.kpis).toBeDefined();
    expect(data.kpis.totalClients).toBeDefined();
    expect(data.kpis.totalPlatformCalls).toBeDefined();
    expect(data.clientPortfolio).toBeDefined();
    expect(Array.isArray(data.clientPortfolio)).toBe(true);
  });

  it('allows verified platform administrator to export platform portfolio CSV', async () => {
    const path = '/api/admin/analytics/export';
    const adminAssertion = createInternalAssertion({
      userId: testUserId,
      orgId: testOrgId,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
      isPlatformAdmin: true,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': adminAssertion },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text).toContain('Organization ID');
    expect(text).toContain('Organization Name');
  });
});
