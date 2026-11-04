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

describe.skipIf(!isLiveReady)('A1 Security: Platform Administrator Server Session Verification Suite', () => {
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

    // User 551 is a regular tenant user in org 501 (is_superuser = false)
    regularUserToken = generateAcuityToken(551, 'user551@example.com');
    // User 1 is a verified platform administrator in org 1 (is_superuser = true)
    superuserToken = generateAcuityToken(1, 'test_admin@example.com');
  });

  it('1. Unauthenticated request is denied with 401 Unauthorized', async () => {
    const res = await fetch(`${NEXTJS_URL}/api/business/admin/session`);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Unauthorized');
  });

  it('2. Expired session is denied with 401 Unauthorized', async () => {
    const expiredToken = generateAcuityToken(1, 'test_admin@example.com', -3600);
    const res = await fetch(`${NEXTJS_URL}/api/business/admin/session`, {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it('3. Cryptographically tampered session token is denied with 401 Unauthorized', async () => {
    const [header, payload] = superuserToken.split('.');
    const forgedSig = crypto.createHmac('sha256', 'wrong-malicious-secret').update(`${header}.${payload}`).digest('base64url');
    const tamperedToken = `${header}.${payload}.${forgedSig}`;

    const res = await fetch(`${NEXTJS_URL}/api/business/admin/session`, {
      headers: {
        Authorization: `Bearer ${tamperedToken}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it('4. Ordinary tenant administrator is denied with 403 Forbidden', async () => {
    const res = await fetch(`${NEXTJS_URL}/api/business/admin/session`, {
      headers: {
        Authorization: `Bearer ${regularUserToken}`,
      },
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Platform administrator privileges required');
  });

  it('5. Valid platform superuser succeeds with 200 OK and verified identity', async () => {
    const res = await fetch(`${NEXTJS_URL}/api/business/admin/session`, {
      headers: {
        Authorization: `Bearer ${superuserToken}`,
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.authenticated).toBe(true);
    expect(json.isSuperuser).toBe(true);
    expect(json.userId).toBe('1');
    expect(json.email).toBe('test_admin@example.com');
    expect(json.organizationId).toBe(1);
  });
});
