import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'path';

// Load local environment configuration
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
  const cleanSql = sql.replace(/\$/g, '\\$');
  return execSync(`psql "${MIGRATION_DATABASE_URL}" -c "${cleanSql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
  });
}

function generateDograhToken(userId: number, email: string, expOffsetSec: number = 3600): string {
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

describe.skipIf(!isLiveReady)('Next.js Real HTTP Proxy Route Boundary & Two-Account Isolation Suite (Blocker 2 Proof)', () => {
  const orgAId = 501;
  const orgBId = 502;
  const userAId = 551;
  const userBId = 552;
  const userNoOrgId = 553;
  const userRevokedId = 554;

  let tokenOrgA: string;
  let tokenOrgB: string;
  let tokenNoOrg: string;
  let tokenRevoked: string;
  let createdContactAId: string;

  beforeAll(async () => {
    // 1. Seed authoritative Dograh organizations in public.organizations
    adminQuery(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (501, 'org_test_501'), (502, 'org_test_502')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Seed authoritative users in public.users
    adminQuery(`
      INSERT INTO public.users (id, email, provider_id, selected_organization_id)
      VALUES 
        (551, 'user551@example.com', 'user_551', 501),
        (552, 'user552@example.com', 'user_552', 502),
        (553, 'user553_no_org@example.com', 'user_553', NULL),
        (554, 'user554_revoked@example.com', 'user_554', 501)
      ON CONFLICT (id) DO UPDATE SET 
        email = EXCLUDED.email, 
        provider_id = EXCLUDED.provider_id, 
        selected_organization_id = EXCLUDED.selected_organization_id;
    `);

    // 3. Seed memberships in public.organization_users
    adminQuery(`
      INSERT INTO public.organization_users (user_id, organization_id)
      VALUES (551, 501), (552, 502)
      ON CONFLICT (user_id, organization_id) DO NOTHING;

      -- Explicitly ensure user 554 has NO membership (revoked state)
      DELETE FROM public.organization_users WHERE user_id = 554;
    `);

    // 4. Generate genuine Dograh JWT tokens
    tokenOrgA = generateDograhToken(userAId, 'user551@example.com');
    tokenOrgB = generateDograhToken(userBId, 'user552@example.com');
    tokenNoOrg = generateDograhToken(userNoOrgId, 'user553_no_org@example.com');
    tokenRevoked = generateDograhToken(userRevokedId, 'user554_revoked@example.com');

    // Clean any residual test contacts
    adminQuery(`
      DELETE FROM business_ext.contacts 
      WHERE tenant_id IN (
        SELECT business_tenant_id FROM business_ext.organization_mappings 
        WHERE dograh_organization_id IN (501, 502)
      );
    `);
  });

  afterAll(async () => {
    adminQuery(`
      DELETE FROM business_ext.contacts 
      WHERE tenant_id IN (
        SELECT business_tenant_id FROM business_ext.organization_mappings 
        WHERE dograh_organization_id IN (501, 502)
      );
    `);
  });

  // 1. Cookie Spoofing with Missing Token -> Rejected
  it('rejects unauthenticated request containing forged OSS_USER cookie with 401 Unauthorized', async () => {
    const forgedUserCookie = JSON.stringify({
      id: userBId,
      organizationId: orgBId,
      email: 'attacker@evil.com',
    });

    const res = await fetch(`${NEXTJS_URL}/api/business/contacts`, {
      method: 'GET',
      headers: {
        Cookie: `OSS_USER=${encodeURIComponent(forgedUserCookie)}`,
      },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Unauthorized');
  });

  // 2. Cookie Spoofing with Valid Token -> Forged Cookie Strictly Ignored
  it('operates strictly on verified Dograh session and ignores forged OSS_USER cookie targeting Org B', async () => {
    const forgedUserCookieOrgB = JSON.stringify({
      id: userAId,
      organizationId: orgBId, // Attacker attempts to target Org B by tampering OSS_USER cookie
    });

    // Real HTTP POST through Next.js proxy
    const res = await fetch(`${NEXTJS_URL}/api/business/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenOrgA}`,
        Cookie: `OSS_USER=${encodeURIComponent(forgedUserCookieOrgB)}`,
      },
      body: JSON.stringify({
        name: 'Alice Org A Lead',
        email: `alice.${Date.now()}@orga.com`,
        phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
        company: 'Org A Enterprise',
        status: 'new',
      }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as { data: { id: string; name: string } };
    expect(data.data.id).toBeDefined();
    expect(data.data.name).toBe('Alice Org A Lead');
    createdContactAId = data.data.id;

    // Org B legitimate query: Must NOT see Org A contact
    const orgBRes = await fetch(`${NEXTJS_URL}/api/business/contacts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenOrgB}`,
      },
    });

    expect(orgBRes.status).toBe(200);
    const orgBData = (await orgBRes.json()) as { data: Array<{ id: string }> };
    const leaked = orgBData.data.find((c) => c.id === createdContactAId);
    expect(leaked).toBeUndefined(); // Org B cannot see Org A contact!
  });

  // 3. Malformed / Tampered Token -> Rejected
  it('rejects malformed or cryptographically tampered Bearer token with 401 Unauthorized', async () => {
    const res = await fetch(`${NEXTJS_URL}/api/business/contacts`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer invalid.tampered.token.12345',
      },
    });

    expect(res.status).toBe(401);
  });

  // 4. Genuine Session Without Selected Organization (A1.4)
  it('rejects genuine user session without a selected organization with 401 Unauthorized', async () => {
    // User 553 is a valid Dograh user in database, but selected_organization_id is NULL
    const res = await fetch(`${NEXTJS_URL}/api/business/contacts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenNoOrg}`,
      },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('missing active organization');
  });

  // 5. Genuine Membership Revocation (A1.5)
  it('rejects request with 403 Forbidden when user membership has been revoked from organization', async () => {
    // User 554 has a valid Dograh token targeting Org 501, but is NOT in public.organization_users
    const res = await fetch(`${NEXTJS_URL}/api/business/contacts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenRevoked}`,
      },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('User is not an active member of the specified organization');
  });

  // 6. Real Session Switching Across Organizations
  it('correctly adapts trust boundary when a multi-org user switches active organization', async () => {
    // Step A: Grant User 551 membership in Org 502 as well
    adminQuery(`
      INSERT INTO public.organization_users (user_id, organization_id)
      VALUES (551, 502)
      ON CONFLICT (user_id, organization_id) DO NOTHING;
    `);

    // Step B: Switch User 551's selected_organization_id to Org 502
    adminQuery('UPDATE public.users SET selected_organization_id = 502 WHERE id = 551;');

    // Step C: User 551 attempts to read Org 501 contact while switched into Org 502 -> 404 Not Found
    const switchedGetRes = await fetch(`${NEXTJS_URL}/api/business/contacts/${createdContactAId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenOrgA}`,
      },
    });
    expect(switchedGetRes.status).toBe(404);

    // Step D: Switch User 551 back to Org 501
    adminQuery('UPDATE public.users SET selected_organization_id = 501 WHERE id = 551;');

    // Step E: User 551 can now read Org 501 contact successfully -> 200 OK
    const restoredGetRes = await fetch(`${NEXTJS_URL}/api/business/contacts/${createdContactAId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenOrgA}`,
      },
    });
    expect(restoredGetRes.status).toBe(200);
    const restoredData = (await restoredGetRes.json()) as { data: { id: string } };
    expect(restoredData.data.id).toBe(createdContactAId);
  });

  // 7. Real Cross-Tenant Isolation: Org B cannot read, mutate, or delete Org A contact
  it('strictly prohibits Org B from reading, updating, or deleting Org A contact over HTTP', async () => {
    // Direct GET by ID
    const getRes = await fetch(`${NEXTJS_URL}/api/business/contacts/${createdContactAId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenOrgB}` },
    });
    expect(getRes.status).toBe(404);

    // Direct PATCH mutation
    const patchRes = await fetch(`${NEXTJS_URL}/api/business/contacts/${createdContactAId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenOrgB}`,
      },
      body: JSON.stringify({ name: 'Hacked by Org B' }),
    });
    expect(patchRes.status).toBe(404);

    // Direct DELETE
    const deleteRes = await fetch(`${NEXTJS_URL}/api/business/contacts/${createdContactAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOrgB}` },
    });
    expect(deleteRes.status).toBe(404);
  });

  // 8. Caller-Supplied Internal Headers are Stripped at Edge
  it('strips caller-supplied X-Internal-Assertion and X-Dograh-Organization-Id headers at Next.js edge', async () => {
    const res = await fetch(`${NEXTJS_URL}/api/business/contacts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenOrgA}`,
        'X-Internal-Assertion': 'malicious-caller-supplied-assertion',
        'X-Dograh-Organization-Id': '99999',
      },
    });

    expect(res.status).toBe(200); // Does NOT fail with assertion error; Next.js generated genuine assertion
  });
});
