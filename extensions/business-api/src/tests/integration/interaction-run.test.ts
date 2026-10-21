import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { adminQuery } from '../test-admin';
import { resolveTenantContext } from '../../services/tenant-mapping.service';
import { crmService } from '../../services/crm.service';
import type { TenantContext } from '../../domain/tenant-mapping.types';

describe('Integration: Interaction & Acuity Run Correlation', () => {
  let orgA: TenantContext;
  let orgB: TenantContext;
  let workflowAId: number;
  let definitionAId: number;
  let runAUuid: string;

  beforeAll(async () => {
    await runMigrations();

    // Clean any prior runs/workflows/orgs
    await adminQuery("DELETE FROM public.workflow_runs WHERE name = 'run-synthetic-771-001' OR workflow_id IN (SELECT id FROM public.workflows WHERE organization_id IN (771, 772))");
    await adminQuery("DELETE FROM public.workflow_definitions WHERE workflow_id IN (SELECT id FROM public.workflows WHERE organization_id IN (771, 772))");
    await adminQuery('DELETE FROM public.workflows WHERE organization_id IN (771, 772)');
    await adminQuery('DELETE FROM public.organizations WHERE id IN (771, 772)');

    // Seed test organizations
    await adminQuery(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (771, 'org_test_771'), (772, 'org_test_772')
      ON CONFLICT (id) DO NOTHING;
    `);

    orgA = await resolveTenantContext(771, 'inter-test');
    orgB = await resolveTenantContext(772, 'inter-test');

    await query('DELETE FROM business_ext.interactions WHERE tenant_id IN ($1, $2)', [
      orgA.businessTenantId,
      orgB.businessTenantId,
    ]);
    await query('DELETE FROM business_ext.contacts WHERE tenant_id IN ($1, $2)', [
      orgA.businessTenantId,
      orgB.businessTenantId,
    ]);

    // Seed workflow, definition, and run for Org A
    const wfRes = await adminQuery<{ id: number }>(`
      INSERT INTO public.workflows (
        organization_id, name, workflow_definition, template_context_variables,
        call_disposition_codes, workflow_configurations, workflow_uuid
      ) VALUES (
        771, 'Support Workflow', '{}', '{}',
        '[]', '{}', gen_random_uuid()::text
      ) RETURNING id;
    `);
    workflowAId = wfRes.rows[0]!.id;

    const defRes = await adminQuery<{ id: number }>(`
      INSERT INTO public.workflow_definitions (workflow_id, version_number, status, workflow_json)
      VALUES ($1, 1, 'published', '{}'::json)
      RETURNING id;
    `, [workflowAId]);
    definitionAId = defRes.rows[0]!.id;

    runAUuid = 'run-synthetic-771-001';
    await adminQuery(`
      INSERT INTO public.workflow_runs (
        name, workflow_id, definition_id, mode, usage_info, cost_info,
        initial_context, gathered_context, annotations
      ) VALUES (
        $1, $2, $3, 'web', '{}'::json, '{}'::json,
        '{}'::json, '{}'::json, '{}'::json
      );
    `, [runAUuid, workflowAId, definitionAId]);
  });

  afterAll(async () => {
    if (orgA?.businessTenantId && orgB?.businessTenantId) {
      await query('DELETE FROM business_ext.interactions WHERE tenant_id IN ($1, $2)', [
        orgA.businessTenantId,
        orgB.businessTenantId,
      ]);
      await query('DELETE FROM business_ext.contacts WHERE tenant_id IN ($1, $2)', [
        orgA.businessTenantId,
        orgB.businessTenantId,
      ]);
    }
    await query("DELETE FROM business_ext.organization_mappings WHERE deployment_id = 'inter-test'");
    await adminQuery("DELETE FROM public.workflow_runs WHERE name = $1 OR workflow_id IN (SELECT id FROM public.workflows WHERE organization_id IN (771, 772))", [runAUuid]);
    await adminQuery("DELETE FROM public.workflow_definitions WHERE workflow_id IN (SELECT id FROM public.workflows WHERE organization_id IN (771, 772))");
    await adminQuery('DELETE FROM public.workflows WHERE organization_id IN (771, 772)');
    await adminQuery('DELETE FROM public.organizations WHERE id IN (771, 772)');
  });

  it('records interaction correlated to Acuity workflow, definition, and run ID', async () => {
    // 1. Create contact
    const contact = await crmService.createContact(orgA, {
      name: 'Bob Miller',
      email: 'bob@enterprise.com',
      phone: '+14155557788',
      company: 'Miller Analytics',
      role: 'Head of Operations',
      status: 'new',
      lifecycleStatus: 'new',
    });

    const initialScore = contact.leadScore ?? 0;

    // 2. Record synthetic Acuity voice run outcome
    const interaction = await crmService.recordInteraction(orgA, {
      contactId: contact.id,
      acuityWorkflowId: workflowAId,
      acuityDefinitionId: definitionAId,
      acuityRunId: runAUuid,
      channel: 'call_inbound',
      durationSeconds: 195, // >= 180s adds points
      sentimentScore: 82,
      sentimentCategory: 'positive',
      wasEscalated: false,
      summary: 'Caller requested an architecture review and expressed high budget availability.',
      transcript: [
        { speaker: 'agent', text: 'Hello, how can I assist you?', timestamp: new Date().toISOString() },
        { speaker: 'customer', text: 'We need enterprise voice agent routing.', timestamp: new Date().toISOString() },
      ],
    });

    expect(interaction.id).toBeDefined();
    expect(interaction.contactId).toBe(contact.id);
    expect(interaction.acuityWorkflowId).toBe(workflowAId);
    expect(interaction.acuityRunId).toBe(runAUuid);
    expect(interaction.acuityWorkflowId).toBe(workflowAId);
    expect(interaction.acuityRunId).toBe(runAUuid);

    // Verify contact stats were updated
    const updatedContact = await crmService.getContactById(orgA, contact.id);
    expect(updatedContact?.callAttempts).toBe(1);
    expect(updatedContact?.lastCallResult).toBe('connected');
    expect(updatedContact?.lifecycleStatus).toBe('connected');

    // Deterministic lead score re-evaluated
    expect(updatedContact?.leadScore).toBeGreaterThan(initialScore);

    // Check timeline events
    const timeline = await crmService.getContactTimeline(orgA, contact.id);
    expect(timeline.length).toBeGreaterThanOrEqual(2);
    const callEvent = timeline.find((t) => t.event.includes('Interaction Completed'));
    expect(callEvent).toBeDefined();
  });

  it('prohibits Organization B from associating an interaction with foreign resources', async () => {
    const orgAContacts = await crmService.getContacts(orgA);
    const contactA = orgAContacts.contacts[0]!;

    // Org B attempts to record an interaction referencing Org A's run ID
    await expect(
      crmService.recordInteraction(orgB, {
        contactId: contactA.id,
        acuityWorkflowId: workflowAId, // Belongs to Org A
        acuityRunId: runAUuid,
        channel: 'call_outbound',
        durationSeconds: 60,
      })
    ).rejects.toThrow(/Forbidden/);

    // Confirm Contact A's timeline was NOT contaminated by Org B
    const aTimeline = await crmService.getContactTimeline(orgA, contactA.id);
    const foreignEvent = aTimeline.find((t) => t.details?.includes('foreign-run-123'));
    expect(foreignEvent).toBeUndefined();
  });
});
