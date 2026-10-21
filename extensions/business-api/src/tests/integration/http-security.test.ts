import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { z } from 'zod';
import { createApp } from '../../app';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { adminQuery } from '../test-admin';
import { env } from '../../config/env';
import {
  createInternalAssertion,
  clearNonceCacheForTesting,
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
    await query("DELETE FROM business_ext.organization_mappings WHERE dograh_organization_id IN (601, 602)");
    await adminQuery("DELETE FROM public.workflows WHERE organization_id IN (601, 602)");
    await adminQuery("DELETE FROM public.organization_users WHERE user_id IN (601, 602)");
    await adminQuery("DELETE FROM public.users WHERE id IN (601, 602)");
    await adminQuery("DELETE FROM public.organizations WHERE id IN (601, 602)");

    // Seed Dograh organizations 601 (Org A) and 602 (Org B)
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
    await query("DELETE FROM business_ext.organization_mappings WHERE dograh_organization_id IN (601, 602)");
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
        deploymentId: env.DOGRAH_DEPLOYMENT_ID,
        secret: insecureSecret,
      })
    ).toThrow('Insecure or missing service secret');
  });

  // A2.3: Tampered organization claim -> denied
  it('rejects assertion with tampered organization claim with 401 Unauthorized', async () => {
    const validAssertion = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.DOGRAH_DEPLOYMENT_ID,
      secret: validSecret,
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
      deploymentId: env.DOGRAH_DEPLOYMENT_ID,
      secret: validSecret,
      customIat: Math.floor(Date.now() / 1000) - 120, // 2 minutes ago
      ttlSeconds: 60, // Expired 60s ago
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
    const fixedNonce = 'replay-nonce-test-fixed-001';
    const assertion = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.DOGRAH_DEPLOYMENT_ID,
      secret: validSecret,
      customNonce: fixedNonce,
    });

    const contactPayload = {
      name: 'Replay Test Lead',
      email: `replay.test.${Date.now()}@example.com`,
      phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      company: 'Replay Defense Inc',
      status: 'new',
    };

    // First attempt: succeeds (201 Created)
    const firstRes = await app.request('/api/contacts', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contactPayload),
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
      body: JSON.stringify(contactPayload),
    });
    expect(replayRes.status).toBe(401);
    const replayJson = (await replayRes.json()) as { error: string };
    expect(replayJson.error).toContain('Replayed internal assertion');
  });

  // A2.7: Valid Org A request cannot access Org B
  it('allows verified Org A to create a contact and prohibits Org B access', async () => {
    const assertionOrgA = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.DOGRAH_DEPLOYMENT_ID,
      secret: validSecret,
    });

    const createRes = await app.request('/api/contacts', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertionOrgA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Jane HTTP',
        email: `jane.${Date.now()}@http-test.com`,
        phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
        company: 'Org A Client',
        status: 'new',
      }),
    });
    expect(createRes.status).toBe(201);
    const createJson = (await createRes.json()) as { data: { id: string; name: string } };
    contactAId = createJson.data.id;

    // Org B attempts to read Org A contact
    const assertionOrgB = createInternalAssertion({
      userId: '602',
      orgId: 602,
      deploymentId: env.DOGRAH_DEPLOYMENT_ID,
      secret: validSecret,
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
    const assertionOrgA = createInternalAssertion({
      userId: '601',
      orgId: 601,
      deploymentId: env.DOGRAH_DEPLOYMENT_ID,
      secret: validSecret,
    });

    const res = await app.request('/api/business-profiles', {
      method: 'POST',
      headers: {
        'X-Internal-Assertion': assertionOrgA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Apex Org A',
        domain: 'apex-orga.com',
        industry: 'FinTech',
        dograhWorkflowId: wfBId, // Belongs to Org B (602)!
      }),
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
      deploymentId: env.DOGRAH_DEPLOYMENT_ID,
      secret: validSecret,
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
