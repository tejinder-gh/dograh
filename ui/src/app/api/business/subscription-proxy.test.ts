import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

import dotenv from 'dotenv';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertSafeDatabaseTarget } from '@/lib/database-guard';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const NEXTJS_URL = process.env.TEST_NEXTJS_URL || 'http://127.0.0.1:3000';
const OSS_JWT_SECRET =
  process.env.OSS_JWT_SECRET || '6492a2ab59b7edc5a21071720f29313b91f6ccc3289b60b998fcdb03be8108ff';

const MIGRATION_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.TEST_ADMIN_DATABASE_URL ||
  '';

function adminQuery(sql: string): string {
  assertSafeDatabaseTarget(MIGRATION_DATABASE_URL, 'test');
  return execSync(`psql "${MIGRATION_DATABASE_URL}"`, {
    input: sql,
    encoding: 'utf-8',
  });
}

function checkLiveEnvironment(): boolean {
  if (!MIGRATION_DATABASE_URL) return false;
  try {
    assertSafeDatabaseTarget(MIGRATION_DATABASE_URL, 'test');
    execSync(`psql "${MIGRATION_DATABASE_URL}" -c "SELECT 1;"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const isLiveReady = checkLiveEnvironment();

function generateAcuityToken(userId: number, email: string, expOffsetSec: number = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: String(userId),
      email,
      exp: now + expOffsetSec,
      iat: now,
    })
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', OSS_JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

describe.skipIf(!isLiveReady)('Next.js Subscription & Admin Accounts Proxy Suite', () => {
  let regularUserToken: string;
  let superuserToken: string;
  let testTenantId: string;

  beforeAll(() => {
    // Seed authoritative Acuity organizations and users
    adminQuery(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (1, 'org_test_1'), (501, 'org_test_501')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.users (id, email, provider_id, selected_organization_id, is_superuser)
      VALUES
        (1, 'test_admin@example.com', 'user_1', 1, true),
        (551, 'user551@example.com', 'user_551', 501, false)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        selected_organization_id = EXCLUDED.selected_organization_id,
        is_superuser = EXCLUDED.is_superuser;

      INSERT INTO public.organization_users (user_id, organization_id)
      VALUES (1, 1), (551, 501)
      ON CONFLICT (user_id, organization_id) DO NOTHING;
    `);

    // Retrieve or seed tenant ID for org 501
    const rawOut = adminQuery(`
      INSERT INTO business_ext.organization_mappings (acuity_organization_id, deployment_id)
      VALUES (501, 'default')
      ON CONFLICT (deployment_id, acuity_organization_id) DO UPDATE SET updated_at = NOW()
      RETURNING business_tenant_id;
    `);
    const match = rawOut.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    testTenantId = match ? match[0] : '';

    if (testTenantId) {
      adminQuery(`
        INSERT INTO business_ext.organization_subscriptions
        (tenant_id, plan_id, status, included_minutes, concurrency_limit)
        VALUES ('${testTenantId}', 'starter', 'active', 250, 2)
        ON CONFLICT (tenant_id) DO NOTHING;
      `);
    }

    regularUserToken = generateAcuityToken(551, 'user551@example.com');
    superuserToken = generateAcuityToken(1, 'test_admin@example.com');
  });

  describe('Client Subscription Endpoint Protection', () => {
    it('rejects unauthenticated request to /api/business/subscription with 401', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/subscription`);
      expect(res.status).toBe(401);
    });

    it('allows authenticated regular user to fetch their subscription overview', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/subscription`, {
        headers: {
          Authorization: `Bearer ${regularUserToken}`,
        },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.plan).toBeDefined();
      expect(data.plan.id).toBeDefined();
      expect(data.status).toBe('active');
      expect(data.totalAllocatedMinutes).toBeGreaterThanOrEqual(250);
      expect(data.availablePlans).toBeDefined();
      expect(data.availablePlans.length).toBeGreaterThanOrEqual(3);
    });

    it('allows client to fetch available subscription plans', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/subscription/plans`, {
        headers: {
          Authorization: `Bearer ${regularUserToken}`,
        },
      });
      expect(res.status).toBe(200);
      const plans = await res.json();
      expect(Array.isArray(plans)).toBe(true);
      const ids = plans.map((p: { id: string }) => p.id);
      expect(ids).toContain('starter');
      expect(ids).toContain('professional');
      expect(ids).toContain('enterprise');
    });
  });

  describe('Admin Accounts & Controls RBAC Boundary', () => {
    it('strictly forbids regular non-superuser from listing client accounts (403)', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/admin/accounts`, {
        headers: {
          Authorization: `Bearer ${regularUserToken}`,
        },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden');
    });

    it('allows verified platform administrator to list all client accounts', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/admin/accounts`, {
        headers: {
          Authorization: `Bearer ${superuserToken}`,
        },
      });
      expect(res.status).toBe(200);
      const accounts = await res.json();
      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThanOrEqual(1);
    });

    it('strictly forbids regular non-superuser from modifying an account subscription (403)', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/admin/accounts/${testTenantId}/subscription`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regularUserToken}`,
        },
        body: JSON.stringify({
          planId: 'enterprise',
          reason: 'Unauthorized attempt',
        }),
      });
      expect(res.status).toBe(403);
    });

    it('allows verified platform administrator to modify account subscription', async () => {
      if (!testTenantId) return;

      const res = await fetch(`${NEXTJS_URL}/api/business/admin/accounts/${testTenantId}/subscription`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superuserToken}`,
        },
        body: JSON.stringify({
          planId: 'professional',
          bonusMinutesDelta: 100,
          concurrencyLimit: 6,
          reason: 'Next.js proxy integration test upgrade',
        }),
      });
      expect(res.status).toBe(200);
      const updated = await res.json();
      expect(updated.plan.id).toBe('professional');
      expect(updated.concurrencyLimit).toBe(6);
    });
  });
});
