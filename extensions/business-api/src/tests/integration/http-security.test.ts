import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createApp } from '../../app';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { env } from '../../config/env';

describe('HTTP Security & Tenant Isolation Boundary', () => {
  const app = createApp();
  const validSecret = env.BUSINESS_EXT_SECRET;

  let wfAId: number;
  let wfBId: number;
  let contactAId: string;

  beforeAll(async () => {
    await runMigrations();

    // Seed Dograh organizations 601 (Org A) and 602 (Org B)
    await query(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (601, 'org_http_601'), (602, 'org_http_602')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed workflows for each org
    const wfARes = await query<{ id: number }>(`
      INSERT INTO public.workflows (organization_id, name, workflow_uuid)
      VALUES (601, 'Org A HTTP Workflow', gen_random_uuid()::text)
      RETURNING id;
    `);
    wfAId = wfARes.rows[0]!.id;

    const wfBRes = await query<{ id: number }>(`
      INSERT INTO public.workflows (organization_id, name, workflow_uuid)
      VALUES (602, 'Org B HTTP Workflow', gen_random_uuid()::text)
      RETURNING id;
    `);
    wfBId = wfBRes.rows[0]!.id;
  });

  afterAll(async () => {
    await query("DELETE FROM business_ext.organization_mappings WHERE dograh_organization_id IN (601, 602)");
  });

  it('rejects direct request missing X-Extension-Secret with 401 Unauthorized', async () => {
    const res = await app.request('/api/contacts', {
      method: 'GET',
      headers: {
        'X-Dograh-Organization-Id': '601',
      },
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Invalid or missing extension service secret');
  });

  it('rejects direct request with forged/invalid secret with 401 Unauthorized', async () => {
    const res = await app.request('/api/contacts', {
      method: 'GET',
      headers: {
        'X-Extension-Secret': 'forged-secret-attacker-guess',
        'X-Dograh-Organization-Id': '601',
      },
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Invalid or missing extension service secret');
  });

  it('rejects request missing X-Dograh-Organization-Id with 400 Bad Request', async () => {
    const res = await app.request('/api/contacts', {
      method: 'GET',
      headers: {
        'X-Extension-Secret': validSecret,
      },
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Missing X-Dograh-Organization-Id');
  });

  it('rejects request for non-existent or inactive Dograh organization with 403 Forbidden', async () => {
    const res = await app.request('/api/contacts', {
      method: 'GET',
      headers: {
        'X-Extension-Secret': validSecret,
        'X-Dograh-Organization-Id': '999999', // Non-existent org
      },
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Organization does not exist or is inactive');
  });

  it('allows verified Org A to create a contact via authenticated HTTP', async () => {
    const res = await app.request('/api/contacts', {
      method: 'POST',
      headers: {
        'X-Extension-Secret': validSecret,
        'X-Dograh-Organization-Id': '601',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Jane HTTP',
        email: 'jane@http-test.com',
        phone: '+15556667777',
        company: 'Org A Client',
        status: 'new',
      }),
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { id: string; name: string } };
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe('Jane HTTP');
    contactAId = json.data.id;
  });

  it('prohibits Org B from accessing Org A contact via HTTP (404 Not Found)', async () => {
    const res = await app.request(`/api/contacts/${contactAId}`, {
      method: 'GET',
      headers: {
        'X-Extension-Secret': validSecret,
        'X-Dograh-Organization-Id': '602', // Org B
      },
    });
    expect(res.status).toBe(404);
  });

  it('prohibits Org A from creating business profile with Org B workflow (403 Forbidden)', async () => {
    const res = await app.request('/api/business-profiles', {
      method: 'POST',
      headers: {
        'X-Extension-Secret': validSecret,
        'X-Dograh-Organization-Id': '601', // Org A
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Apex Org A',
        domain: 'apex-orga.com',
        industry: 'FinTech',
        dograhWorkflowId: wfBId, // Belongs to Org B!
      }),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('does not belong to your organization');
  });
});
