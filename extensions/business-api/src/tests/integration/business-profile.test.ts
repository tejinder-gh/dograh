import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { resolveTenantContext } from '../../services/tenant-mapping.service';
import { businessProfileService } from '../../services/business-profile.service';
import type { TenantContext } from '../../domain/tenant-mapping.types';

describe('Integration: Business Profile CRUD & Multi-Tenant Boundaries', () => {
  let orgA: TenantContext;
  let orgB: TenantContext;
  let workflowAId: number;
  let workflowBId: number;

  beforeAll(async () => {
    await runMigrations();
    orgA = await resolveTenantContext(881, 'prof-test');
    orgB = await resolveTenantContext(882, 'prof-test');

    // Clean prior test records
    await query('DELETE FROM business_ext.business_profiles WHERE tenant_id IN ($1, $2)', [
      orgA.businessTenantId,
      orgB.businessTenantId,
    ]);

    // Ensure organizations exist in public.organizations for workflow FK if needed
    await query(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (881, 'org_test_881'), (882, 'org_test_882')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Insert synthetic workflows into public.workflows for testing
    const wfARes = await query<{ id: number }>(`
      INSERT INTO public.workflows (
        organization_id, name, workflow_definition, template_context_variables,
        call_disposition_codes, workflow_configurations, workflow_uuid
      ) VALUES (
        881, 'Org A Voice Assistant', '{}', '{}',
        '[]', '{}', gen_random_uuid()::text
      ) RETURNING id;
    `);
    workflowAId = wfARes.rows[0]!.id;

    const wfBRes = await query<{ id: number }>(`
      INSERT INTO public.workflows (
        organization_id, name, workflow_definition, template_context_variables,
        call_disposition_codes, workflow_configurations, workflow_uuid
      ) VALUES (
        882, 'Org B Voice Assistant', '{}', '{}',
        '[]', '{}', gen_random_uuid()::text
      ) RETURNING id;
    `);
    workflowBId = wfBRes.rows[0]!.id;
  });

  afterAll(async () => {
    await query('DELETE FROM business_ext.business_profiles WHERE tenant_id IN ($1, $2)', [
      orgA.businessTenantId,
      orgB.businessTenantId,
    ]);
    await query('DELETE FROM public.workflows WHERE id IN ($1, $2)', [workflowAId, workflowBId]);
    await query('DELETE FROM public.organizations WHERE id IN (881, 882)');
    await query("DELETE FROM business_ext.organization_mappings WHERE deployment_id = 'prof-test'");
  });

  it('allows Organization A to create a business profile linked to its Dograh workflow', async () => {
    const profile = await businessProfileService.createProfile(orgA, {
      name: 'Apex Advisory Services',
      domain: 'apex-advisory.com',
      industry: 'Financial Advisory',
      description: 'Wealth management and tax strategy firm',
      brandTone: 'Consultative, empathetic, highly discreet',
      inboundGoal: 'Answer client inquiries and schedule tax consultations.',
      outboundGoal: 'Reach out to accredited prospects.',
      operatingHours: {
        timezone: 'America/New_York',
        schedule: {
          monday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
        },
      },
      knowledgeSources: [
        {
          id: 'kb-1',
          name: '2026 Tax Strategy Guide',
          sourceType: 'document',
          verified: true,
        },
      ],
      dograhWorkflowId: workflowAId,
    });

    expect(profile.id).toBeDefined();
    expect(profile.tenantId).toBe(orgA.businessTenantId);
    expect(profile.name).toBe('Apex Advisory Services');
    expect(profile.dograhWorkflowId).toBe(workflowAId);
  });

  it('rejects Organization A attempting to bind a workflow owned by Organization B', async () => {
    expect(
      businessProfileService.createProfile(orgA, {
        name: 'Spoofed Org Profile',
        domain: 'spoof.com',
        industry: 'Testing',
        dograhWorkflowId: workflowBId, // Belongs to Org B (882), not Org A (881)
      })
    ).rejects.toThrow(`Workflow ID ${workflowBId} does not exist or does not belong to your organization`);
  });

  it('allows a profile with no assigned workflow (dograhWorkflowId: null)', async () => {
    const profile = await businessProfileService.createProfile(orgA, {
      name: 'Unassigned Brand',
      domain: 'unassigned-brand.io',
      industry: 'Technology',
      dograhWorkflowId: null,
    });

    expect(profile.id).toBeDefined();
    expect(profile.dograhWorkflowId).toBeNull();
  });

  it('prohibits Organization B from reading or modifying Organization A profile', async () => {
    const orgAProfiles = await businessProfileService.getProfiles(orgA);
    const apex = orgAProfiles.find((p) => p.domain === 'apex-advisory.com');
    expect(apex).toBeDefined();

    // Org B queries profiles: none of Org A's profiles visible
    const orgBProfiles = await businessProfileService.getProfiles(orgB);
    const leaked = orgBProfiles.find((p) => p.domain === 'apex-advisory.com');
    expect(leaked).toBeUndefined();

    // Org B direct read by ID fails
    const directFetch = await businessProfileService.getProfileById(orgB, apex!.id);
    expect(directFetch).toBeNull();

    // Org B update attempt fails
    expect(
      businessProfileService.updateProfile(orgB, apex!.id, {
        name: 'Hacked Name',
      })
    ).rejects.toThrow('Business profile not found or unauthorized');
  });

  it('enforces domain uniqueness per organization while allowing same domain in separate orgs', async () => {
    // Org A duplicate domain should fail
    expect(
      businessProfileService.createProfile(orgA, {
        name: 'Duplicate Apex',
        domain: 'apex-advisory.com',
        industry: 'Other',
      })
    ).rejects.toThrow('already exists in your organization');

    // Org B can register same domain without interference
    const orgBProfile = await businessProfileService.createProfile(orgB, {
      name: 'Apex In Org B',
      domain: 'apex-advisory.com',
      industry: 'Different Industry',
    });

    expect(orgBProfile.id).toBeDefined();
    expect(orgBProfile.tenantId).toBe(orgB.businessTenantId);
  });
});
