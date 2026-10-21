import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { resolveTenantContext } from '../../services/tenant-mapping.service';
import { crmService } from '../../services/crm.service';
import type { TenantContext } from '../../domain/tenant-mapping.types';

describe('Integration: Interaction & Dograh Run Correlation', () => {
  let orgA: TenantContext;
  let orgB: TenantContext;

  beforeAll(async () => {
    await runMigrations();
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
  });

  afterAll(async () => {
    await query('DELETE FROM business_ext.interactions WHERE tenant_id IN ($1, $2)', [
      orgA.businessTenantId,
      orgB.businessTenantId,
    ]);
    await query('DELETE FROM business_ext.contacts WHERE tenant_id IN ($1, $2)', [
      orgA.businessTenantId,
      orgB.businessTenantId,
    ]);
    await query("DELETE FROM business_ext.organization_mappings WHERE deployment_id = 'inter-test'");
  });

  it('records interaction correlated to Dograh workflow, definition, and run ID', async () => {
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

    // 2. Record synthetic Dograh voice run outcome
    const interaction = await crmService.recordInteraction(orgA, {
      contactId: contact.id,
      dograhWorkflowId: 10,
      dograhDefinitionId: 105,
      dograhRunId: 'dograh-run-uuid-987654',
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
    expect(interaction.dograhWorkflowId).toBe(10);
    expect(interaction.dograhDefinitionId).toBe(105);
    expect(interaction.dograhRunId).toBe('dograh-run-uuid-987654');

    // 3. Verify contact timeline received automatic audit record
    const updatedContact = await crmService.getContactById(orgA, contact.id);
    expect(updatedContact).not.toBeNull();
    expect(updatedContact?.callAttempts).toBe(1);
    expect(updatedContact?.lastCallResult).toBe('connected');
    expect(updatedContact?.lifecycleStatus).toBe('connected');

    // Deterministic lead score re-evaluated
    expect(updatedContact?.leadScore).toBeGreaterThan(initialScore);

    // Check timeline events
    const timeline = await crmService.getContactTimeline(orgA, contact.id);
    expect(timeline.length).toBeGreaterThanOrEqual(2); // Lead Created + Interaction Completed
    const callEvent = timeline.find((t) => t.event.includes('Interaction Completed'));
    expect(callEvent).toBeDefined();
  });

  it('prohibits Organization B from associating an interaction with Organization A contact', async () => {
    const orgAContacts = await crmService.getContacts(orgA);
    const contactA = orgAContacts.contacts[0]!;

    // Org B records an interaction targeting Contact A's ID
    const orgBInteraction = await crmService.recordInteraction(orgB, {
      contactId: contactA.id, // Foreign contact
      dograhRunId: 'foreign-run-123',
      channel: 'call_outbound',
      durationSeconds: 60,
    });

    // The repository unlinks foreign contactId to prevent cross-tenant correlation
    expect(orgBInteraction.contactId).toBeNull();

    // Confirm Contact A's timeline was NOT contaminated by Org B
    const aTimeline = await crmService.getContactTimeline(orgA, contactA.id);
    const foreignEvent = aTimeline.find((t) => t.details?.includes('foreign-run-123'));
    expect(foreignEvent).toBeUndefined();
  });
});
