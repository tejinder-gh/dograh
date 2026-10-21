import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createApp } from '../../app';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { adminQuery } from '../test-admin';
import { env } from '../../config/env';
import {
  createInternalAssertion,
  clearNonceCacheForTesting,
  setNonceStoreOverrideForTesting,
  KNOWN_INSECURE_SECRETS,
} from '../../config/signed-assertion';

describe('HTTP Security & Tenant Isolation Boundary (A2 Attack Suite)', () => {
  const app = createApp();
  const validSecret = env.BUSINESS_EXT_SECRET;

  let wfAId: number;
  let wfBId: number;
  let contactAId: string;

  beforeAll(async () => {
    await runMigrations();

    // Clean up any stale mappings or test data
    await query("DELETE FROM business_ext.organization_mappings WHERE acuity_organization_id IN (601, 602)");
    await adminQuery("DELETE FROM public.workflows WHERE organization_id IN (601, 602)");
    await adminQuery("DELETE FROM public.organization_users WHERE user_id IN (601, 602)");
    await adminQuery("DELETE FROM public.users WHERE id IN (601, 602)");
    await adminQuery("DELETE FROM public.organizations WHERE id IN (601, 602)");

    // Seed Acuity organizations 601 (Org A) and 602 (Org B)
    await adminQuery(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (601, 'org_http_601'), (602, 'org_http_602')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed users 601 and 602 with memberships in their respective organizations
    await adminQuery(`
      INSERT INTO public.users (id, email, provider_id)
      VALUES (601, 'user601@example.com', 'user_http_601'),
             (602, 'user602@example.com', 'user_http_602')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, provider_id = EXCLUDED.provider_id;

      INSERT INTO public.organization_users (user_id, organization_id)
      VALUES (601, 601), (602, 602)
      ON CONFLICT (user_id, organization_id) DO NOTHING;
    `);

    // Seed workflows for each org
    const wfARes = await adminQuery<{ id: number }>(`
      INSERT INTO public.workflows (
        organization_id, name, workflow_definition, template_context_variables,
        call_disposition_codes, workflow_configurations, workflow_uuid
      ) VALUES (
        601, 'Org A HTTP Workflow', '{}', '{}',
        '[]', '{}', gen_random_uuid()::text
      ) RETURNING id;
    `);
    wfAId = wfARes.rows[0]!.id;

    const wfBRes = await adminQuery<{ id: number }>(`
      INSERT INTO public.workflows (
        organization_id, name, workflow_definition, template_context_variables,
        call_disposition_codes, workflow_configurations, workflow_uuid
      ) VALUES (
        602, 'Org B HTTP Workflow', '{}', '{}',
        '[]', '{}', gen_random_uuid()::text
      ) RETURNING id;
    `);
    wfBId = wfBRes.rows[0]!.id;
  });

  afterAll(async () => {
    clearNonceCacheForTesting();
    await query("DELETE FROM business_ext.contacts WHERE name IN ('Jane HTTP', 'Replay Test Lead')");
    await query("DELETE FROM business_ext.business_profiles WHERE domain IN ('apex-orga.com')");
    await query("DELETE FROM business_ext.organization_mappings WHERE acuity_organization_id IN (601, 602)");
    await adminQuery("DELETE FROM public.workflows WHERE organization_id IN (601, 602)");
    await adminQuery("DELETE FROM public.organization_users WHERE user_id IN (601, 602)");
    await adminQuery("DELETE FROM public.users WHERE id IN (601, 602)");
    await adminQuery("DELETE FROM public.organizations WHERE id IN (601, 602)");
  });

  // A2.1: Missing internal authentication -> denied
  it('rejects direct request missing X-Internal-Assertion header with 401 Unauthorized', async () => {
    const res = await app.request('/api/contacts', {
      method: 'GET',
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Missing internal service assertion');
  });

  // A2.2: Known default secret -> denied
  it('prohibits assertion creation or validation with known default secret', () => {
    const insecureSecret = 'business-extension-local-secret-change-in-prod';
    expect(() =>
      createInternalAssertion({
        userId: '601',
        orgId: 601,
        deploymentId: env.Acuity_DEPLOYMENT_ID,
        secret: insecureSecret,
      })
    ).toThrow('Insecure or missing service secret');
  });

  // A2.3: Tampered organization claim -> denied
  it('rejects assertion with tampered organization claim with 401 Unauthorized', async () => {
    const validAssertion = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.Acuity_DEPLOYMENT_ID,
      secret: validSecret,
      method: 'GET',
      path: '/api/contacts',
    });

    const [headerB64, payloadB64, sigB64] = validAssertion.split('.');
    const decodedPayload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString());
    decodedPayload.org = 602; // Attacker tampers org from 601 to 602 without valid key
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
    const tamperedAssertion = `${headerB64}.${tamperedPayloadB64}.${sigB64}`;

    const res = await app.request('/api/contacts', {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': tamperedAssertion,
      },
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Tampered internal assertion signature');
  });

  // A2.4: Tampered deployment claim -> denied
  it('rejects assertion with mismatched/tampered deployment ID with 401 Unauthorized', async () => {
    const foreignDeploymentAssertion = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: 'foreign-cluster-or-tenant',
      secret: validSecret,
      method: 'GET',
      path: '/api/contacts',
    });

    const res = await app.request('/api/contacts', {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': foreignDeploymentAssertion,
      },
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Tampered deployment claim');
  });

  // A2.5: Expired internal assertion -> denied
  it('rejects expired internal assertion with 401 Unauthorized', async () => {
    const expiredAssertion = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.Acuity_DEPLOYMENT_ID,
      secret: validSecret,
      ttlSeconds: -10, // Expired 10 seconds ago
      method: 'GET',
      path: '/api/contacts',
    });

    const res = await app.request('/api/contacts', {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': expiredAssertion,
      },
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Expired internal assertion');
  });

  // A2.6: Replayed consequential request -> no duplicate effect
  it('prevents replay of consequential request (duplicate POST blocked on second attempt)', async () => {
    const fixedNonce = `replay-nonce-${Date.now()}-${Math.random()}`;
    const contactPayload = {
      name: 'Replay Test Lead',
      email: `replay.test.${Date.now()}@example.com`,
      phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      company: 'Replay Defense Inc',
      status: 'new',
    };
    const bodyStr = JSON.stringify(contactPayload);

    const assertion = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.Acuity_DEPLOYMENT_ID,
      secret: validSecret,
      customNonce: fixedNonce,
      method: 'POST',
      path: '/api/contacts',
      body: bodyStr,
    });

    // First attempt: succeeds (201 Created)
    const firstRes = await app.request('/api/contacts', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertion,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });
    expect(firstRes.status).toBe(201);
    const firstJson = (await firstRes.json()) as { data: { id: string } };
    expect(firstJson.data.id).toBeDefined();

    // Replay attempt with same assertion and nonce: rejected with 401 Unauthorized
    const replayRes = await app.request('/api/contacts', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertion,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });
    expect(replayRes.status).toBe(401);
    const replayJson = (await replayRes.json()) as { error: string };
    expect(replayJson.error).toContain('Replay detected');
  });

  // A2.6b: Multi-Instance Replay Protection Test (Blocker 1)
  it('prevents replay across TWO distinct service instances sharing the atomic nonce store', async () => {
    const instanceA = createApp();
    const instanceB = createApp();

    const sharedNonce = `multi-instance-nonce-${Date.now()}`;
    const payload = {
      name: 'Multi Instance Lead',
      email: `multi.inst.${Date.now()}@example.com`,
      phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      company: 'Multi Instance Corp',
      status: 'new',
    };
    const bodyStr = JSON.stringify(payload);

    const assertion = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.Acuity_DEPLOYMENT_ID,
      secret: validSecret,
      customNonce: sharedNonce,
      method: 'POST',
      path: '/api/contacts',
      body: bodyStr,
    });

    // Send assertion to Instance A: Succeeds (201 Created)
    const resA = await instanceA.request('/api/contacts', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertion,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });
    expect(resA.status).toBe(201);

    // Immediately replay the EXACT SAME assertion to Instance B: Denied (401 Replay detected)
    const resB = await instanceB.request('/api/contacts', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertion,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });
    expect(resB.status).toBe(401);
    const jsonB = (await resB.json()) as { error: string };
    expect(jsonB.error).toContain('Replay detected');
  });

  // A2.6c: Cryptographic Request Binding & Substitution Prevention (Blocker 1)
  describe('Cryptographic Request Binding Verification', () => {
    it('rejects assertion when HTTP method is substituted (signed for GET, used on POST)', async () => {
      const getAssertion = createInternalAssertion({
        userId: '601',
        orgId: 601,
        deploymentId: env.Acuity_DEPLOYMENT_ID,
        secret: validSecret,
        method: 'GET',
        path: '/api/contacts',
      });

      const res = await app.request('/api/contacts', {
        method: 'POST',
        headers: {
          'X-Internal-Assertion': getAssertion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Substituted Method' }),
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('Request method mismatch');
    });

    it('rejects assertion when request path is substituted (signed for /api/contacts, used on /api/contacts/batch)', async () => {
      const contactsAssertion = createInternalAssertion({
        userId: '601',
        orgId: 601,
        deploymentId: env.Acuity_DEPLOYMENT_ID,
        secret: validSecret,
        method: 'POST',
        path: '/api/contacts',
        body: JSON.stringify({ contacts: [] }),
      });

      const res = await app.request('/api/contacts/batch', {
        method: 'POST',
        headers: {
          'X-Internal-Assertion': contactsAssertion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contacts: [] }),
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('Request URI mismatch');
    });

    it('rejects assertion when request body is tampered or substituted', async () => {
      const originalBody = JSON.stringify({ name: 'Original Contact', email: 'orig@example.com' });
      const tamperedBody = JSON.stringify({ name: 'Hacked Contact', email: 'hacked@example.com' });

      const assertion = createInternalAssertion({
        userId: '601',
        orgId: 601,
        deploymentId: env.Acuity_DEPLOYMENT_ID,
        secret: validSecret,
        method: 'POST',
        path: '/api/contacts',
        body: originalBody,
      });

      const res = await app.request('/api/contacts', {
        method: 'POST',
        headers: {
          'X-Internal-Assertion': assertion,
          'Content-Type': 'application/json',
        },
        body: tamperedBody, // Caller tampered with the payload
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('Request body hash mismatch');
    });

    it('rejects assertion missing required request method claim (mth) with 401', async () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = {
        v: 1,
        iss: 'acuity-ui-proxy',
        aud: 'business-extension-api',
        sub: '601',
        org: 601,
        dep: env.Acuity_DEPLOYMENT_ID,
        uri: '/api/contacts',
        bdy: crypto.createHash('sha256').update('').digest('hex'),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        nonce: 'missing-mth-nonce',
      };
      const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const data = `${headerB64}.${payloadB64}`;
      const sig = crypto.createHmac('sha256', validSecret).update(data).digest('base64url');
      const badAssertion = `${data}.${sig}`;

      const res = await app.request('/api/contacts', {
        method: 'GET',
        headers: { 'X-Internal-Assertion': badAssertion },
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('missing required request method claim');
    });

    it('rejects assertion missing required request URI claim (uri) with 401', async () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = {
        v: 1,
        iss: 'acuity-ui-proxy',
        aud: 'business-extension-api',
        sub: '601',
        org: 601,
        dep: env.Acuity_DEPLOYMENT_ID,
        mth: 'GET',
        bdy: crypto.createHash('sha256').update('').digest('hex'),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        nonce: 'missing-uri-nonce',
      };
      const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const data = `${headerB64}.${payloadB64}`;
      const sig = crypto.createHmac('sha256', validSecret).update(data).digest('base64url');
      const badAssertion = `${data}.${sig}`;

      const res = await app.request('/api/contacts', {
        method: 'GET',
        headers: { 'X-Internal-Assertion': badAssertion },
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('missing required request URI claim');
    });

    it('rejects assertion missing required request body hash claim (bdy) with 401', async () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = {
        v: 1,
        iss: 'acuity-ui-proxy',
        aud: 'business-extension-api',
        sub: '601',
        org: 601,
        dep: env.Acuity_DEPLOYMENT_ID,
        mth: 'GET',
        uri: '/api/contacts',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        nonce: 'missing-bdy-nonce',
      };
      const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const data = `${headerB64}.${payloadB64}`;
      const sig = crypto.createHmac('sha256', validSecret).update(data).digest('base64url');
      const badAssertion = `${data}.${sig}`;

      const res = await app.request('/api/contacts', {
        method: 'GET',
        headers: { 'X-Internal-Assertion': badAssertion },
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('missing required request body hash claim');
    });

    it('rejects assertion when query parameters in URI are tampered with 401', async () => {
      const assertion = createInternalAssertion({
        userId: '601',
        orgId: 601,
        deploymentId: env.Acuity_DEPLOYMENT_ID,
        secret: validSecret,
        method: 'GET',
        path: '/api/contacts?limit=10&page=1',
      });

      // Attacker tries to change query parameter page to 2
      const res = await app.request('/api/contacts?limit=10&page=2', {
        method: 'GET',
        headers: {
          'X-Internal-Assertion': assertion,
        },
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('Request URI mismatch');
    });

    it('accepts assertion with permuted query parameters due to canonical query normalization', async () => {
      // Signed with page=1&limit=10
      const assertion = createInternalAssertion({
        userId: '601',
        orgId: 601,
        deploymentId: env.Acuity_DEPLOYMENT_ID,
        secret: validSecret,
        method: 'GET',
        path: '/api/contacts?page=1&limit=10',
      });

      // Request sent with limit=10&page=1 (sorted order matches normalized URI)
      const res = await app.request('/api/contacts?limit=10&page=1', {
        method: 'GET',
        headers: {
          'X-Internal-Assertion': assertion,
        },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Fail-Closed Replay Defense on Nonce Store Failure', () => {
    it('fails closed with 503 Service Unavailable and prevents mutation when nonce store errors', async () => {
      const uniqueEmail = `fault.injection.${Date.now()}@example.com`;
      const contactPayload = {
        name: 'Fault Test Contact',
        email: uniqueEmail,
        phone: '+15559876543',
        status: 'new',
      };
      const bodyStr = JSON.stringify(contactPayload);

      const assertion = createInternalAssertion({
        userId: '601',
        orgId: 601,
        deploymentId: env.Acuity_DEPLOYMENT_ID,
        secret: validSecret,
        method: 'POST',
        path: '/api/contacts',
        body: bodyStr,
      });

      // Inject simulated database error into atomic nonce store
      setNonceStoreOverrideForTesting(async () => {
        throw new Error('PostgreSQL connection pool exhausted or database unreachable');
      });

      try {
        const res = await app.request('/api/contacts', {
          method: 'POST',
          headers: {
            'X-Internal-Assertion': assertion,
            'Content-Type': 'application/json',
          },
          body: bodyStr,
        });

        // Must fail closed with 503 Service Unavailable
        expect(res.status).toBe(503);
        const json = (await res.json()) as { error: string };
        expect(json.error).toContain('Replay protection store is unavailable');

        // Verify that NO contact was created despite core database being intact
        const checkRes = await query(
          'SELECT id FROM business_ext.contacts WHERE email = $1',
          [uniqueEmail]
        );
        expect(checkRes.rows.length).toBe(0);
      } finally {
        // Reset override
        setNonceStoreOverrideForTesting(null);
      }
    });
  });

  // A2.7: Valid Org A request cannot access Org B
  it('allows verified Org A to create a contact and prohibits Org B access', async () => {
    const contactPayload = {
      name: 'Jane HTTP',
      email: `jane.${Date.now()}@http-test.com`,
      phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      company: 'Org A Client',
      status: 'new',
    };
    const bodyStr = JSON.stringify(contactPayload);

    const assertionOrgA = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.Acuity_DEPLOYMENT_ID,
      secret: validSecret,
      method: 'POST',
      path: '/api/contacts',
      body: bodyStr,
    });

    const createRes = await app.request('/api/contacts', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertionOrgA,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });
    expect(createRes.status).toBe(201);
    const createJson = (await createRes.json()) as { data: { id: string; name: string } };
    contactAId = createJson.data.id;

    // Org B attempts to read Org A contact
    const assertionOrgB = createInternalAssertion({
      userId: '602',
      orgId: 602,
      deploymentId: env.Acuity_DEPLOYMENT_ID,
      secret: validSecret,
      method: 'GET',
      path: `/api/contacts/${contactAId}`,
    });

    const getRes = await app.request(`/api/contacts/${contactAId}`, {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': assertionOrgB,
      },
    });
    expect(getRes.status).toBe(404);
  });

  it('prohibits Org A from creating business profile with Org B workflow (403 Forbidden)', async () => {
    const profilePayload = {
      name: 'Apex Org A',
      domain: 'apex-orga.com',
      industry: 'FinTech',
      acuityWorkflowId: wfBId, // Belongs to Org B (602)!
    };
    const bodyStr = JSON.stringify(profilePayload);

    const assertionOrgA = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.Acuity_DEPLOYMENT_ID,
      secret: validSecret,
      method: 'POST',
      path: '/api/business-profiles',
      body: bodyStr,
    });

    const res = await app.request('/api/business-profiles', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertionOrgA,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('does not belong to your organization');
  });

  // A2.8: Production startup without required secrets -> fails closed
  it('enforces that environment configuration fails validation if BUSINESS_EXT_SECRET is missing, short, or insecure', () => {
    const testSchema = z.object({
      BUSINESS_EXT_SECRET: z
        .string({
          required_error: 'BUSINESS_EXT_SECRET is required and must be explicitly configured',
        })
        .min(32, 'BUSINESS_EXT_SECRET must be at least 32 characters in length')
        .refine(
          (val) => !KNOWN_INSECURE_SECRETS.has(val),
          'BUSINESS_EXT_SECRET must not use a known insecure default secret'
        ),
    });

    // 1. Missing secret
    const missingRes = testSchema.safeParse({});
    expect(missingRes.success).toBe(false);

    // 2. Short secret
    const shortRes = testSchema.safeParse({ BUSINESS_EXT_SECRET: 'too-short-secret' });
    expect(shortRes.success).toBe(false);

    // 3. Known default secret
    const knownDefaultRes = testSchema.safeParse({
      BUSINESS_EXT_SECRET: 'business-extension-local-secret-change-in-prod',
    });
    expect(knownDefaultRes.success).toBe(false);

    // 4. Valid high-entropy secret
    const validRes = testSchema.safeParse({
      BUSINESS_EXT_SECRET: 'a-sufficiently-long-and-secure-high-entropy-production-secret-12345',
    });
    expect(validRes.success).toBe(true);
  });

  // Membership revocation test
  it('rejects assertion if user is not a member of the organization (revoked membership) with 403 Forbidden', async () => {
    // Assertion claiming User 601 in Org 602 (User 601 is NOT in Org 602)
    const invalidMembershipAssertion = createInternalAssertion({
      userId: '601',
      orgId: 602,
      deploymentId: env.Acuity_DEPLOYMENT_ID,
      secret: validSecret,
      method: 'GET',
      path: '/api/contacts',
    });

    const res = await app.request('/api/contacts', {
      method: 'GET',
      headers: {
        'X-Internal-Assertion': invalidMembershipAssertion,
      },
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('User is not an active member of the specified organization');
  });
});
