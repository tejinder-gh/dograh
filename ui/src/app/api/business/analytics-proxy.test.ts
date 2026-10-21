import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

import dotenv from 'dotenv';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '../extensions/business-api/.env') });

const NEXTJS_URL = process.env.TEST_NEXTJS_URL || 'http://127.0.0.1:3000';
const OSS_JWT_SECRET =
  process.env.OSS_JWT_SECRET || '6492a2ab59b7edc5a21071720f29313b91f6ccc3289b60b998fcdb03be8108ff';

const MIGRATION_DATABASE_URL =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.TEST_ADMIN_DATABASE_URL ||
  process.env.DATABASE_URL ||
  '';

function adminQuery(sql: string): string {
  if (!MIGRATION_DATABASE_URL) {
    throw new Error('MIGRATION_DATABASE_URL or TEST_ADMIN_DATABASE_URL must be configured in environment');
  }
  return execSync(`psql "${MIGRATION_DATABASE_URL}"`, {
    input: sql,
    encoding: 'utf-8',
  });
}

function checkLiveEnvironment(): boolean {
  if (!MIGRATION_DATABASE_URL) return false;
  try {
    execSync(`psql "${MIGRATION_DATABASE_URL}" -c "SELECT 1;"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const isLiveReady = checkLiveEnvironment();

if (process.env.REQUIRE_LIVE_TESTS === 'true' && !isLiveReady) {
  throw new Error(
    'REQUIRE_LIVE_TESTS=true but live environment check failed. MIGRATION_DATABASE_URL is either missing or psql connection failed.'
  );
}

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

describe.skipIf(!isLiveReady)('Next.js Analytics & Platform Command Center Proxy Integration Suite', () => {
  let regularUserToken: string;
  let superuserToken: string;

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

    // User 551 is a regular user in org 501 (is_superuser = false)
    regularUserToken = generateAcuityToken(551, 'user551@example.com');
    // User 1 is a verified platform administrator in org 1 (is_superuser = true)
    superuserToken = generateAcuityToken(1, 'test_admin@example.com');
  });

  describe('Unauthenticated & Cryptographic Token Protection', () => {
    it('rejects unauthenticated request to client analytics with 401', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/analytics/overview`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('rejects unauthenticated request to admin analytics with 401', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/admin/analytics/overview`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('rejects expired JWT token with 401 Unauthorized', async () => {
      const expiredToken = generateAcuityToken(551, 'user551@example.com', -3600);
      const res = await fetch(`${NEXTJS_URL}/api/business/analytics/overview?preset=30d`, {
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      });
      expect(res.status).toBe(401);
    });

    it('rejects forged token signature with 401 Unauthorized', async () => {
      const forgedSigToken = `${regularUserToken.split('.').slice(0, 2).join('.')}.invalid_forged_sig_12345`;
      const res = await fetch(`${NEXTJS_URL}/api/business/analytics/overview?preset=30d`, {
        headers: {
          Authorization: `Bearer ${forgedSigToken}`,
        },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('Client Intelligence Analytics Proxy', () => {
    it('allows authenticated regular user to fetch client analytics overview', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/analytics/overview?preset=30d`, {
        headers: {
          Authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('timeframe');
      expect(data).toHaveProperty('kpis');
      expect(data.kpis).toHaveProperty('totalCalls');
      expect(data.kpis).toHaveProperty('staffHoursSaved');
      expect(Array.isArray(data.callVolumeSeries)).toBe(true);
      expect(Array.isArray(data.hourlyHeatmap)).toBe(true);
      expect(Array.isArray(data.topAgents)).toBe(true);
    });

    it('allows client analytics CSV export with correct headers and attachment filename', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/analytics/export?preset=30d`, {
        headers: {
          Authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('text/csv');
      const disposition = res.headers.get('content-disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('.csv');

      const csvText = await res.text();
      expect(csvText).toContain('Metric,Current Period,Previous Period,Growth (%),Measurement Status');
      expect(csvText).toContain('Total Calls');
    });
  });

  describe('Platform Command Center Admin Proxy Authorization', () => {
    it('strictly forbids regular non-superuser from accessing platform admin overview (403)', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/admin/analytics/overview?preset=30d`, {
        headers: {
          Authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Platform administrator privileges required');
    });

    it('strictly forbids regular non-superuser from exporting platform portfolio CSV (403)', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/admin/analytics/export?preset=30d`, {
        headers: {
          Authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Platform administrator privileges required');
    });

    it('allows verified platform administrator (superuser) to fetch platform overview', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/admin/analytics/overview?preset=30d`, {
        headers: {
          Authorization: `Bearer ${superuserToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('timeframe');
      expect(data).toHaveProperty('kpis');
      expect(data.kpis).toHaveProperty('totalClients');
      expect(data.kpis).toHaveProperty('totalPlatformCalls');
      expect(Array.isArray(data.clientPortfolio)).toBe(true);
      expect(Array.isArray(data.usageTrend)).toBe(true);
      expect(Array.isArray(data.providerBreakdown)).toBe(true);
    });

    it('allows platform administrator to export client portfolio CSV', async () => {
      const res = await fetch(`${NEXTJS_URL}/api/business/admin/analytics/export?preset=30d`, {
        headers: {
          Authorization: `Bearer ${superuserToken}`,
        },
      });

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('text/csv');
      const disposition = res.headers.get('content-disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('platform-portfolio');

      const csvText = await res.text();
      expect(csvText).toContain('Organization ID,Organization Name,Tenant ID,Status,Active Agents,Total Calls,Total Minutes,AI Cost (USD),Created At');
    });
  });
});
