import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { resolveTenantContext } from '../../services/tenant-mapping.service';
import { crmService } from '../../services/crm.service';
import type { TenantContext } from '../../domain/tenant-mapping.types';

describe('Integration: Two-Organization CRM Isolation', () => {
  let orgA: TenantContext;
  let orgB: TenantContext;

  beforeAll(async () => {
    await runMigrations();
    // Use test org IDs 991 and 992
    orgA = await resolveTenantContext(991, 'iso-test');
    orgB = await resolveTenantContext(992, 'iso-test');

    // Clean any prior test data
    await query('DELETE FROM business_ext.contacts WHERE tenant_id IN ($1, $2)', [
      orgA.businessTenantId,
      orgB.businessTenantId,
    ]);
  });

  afterAll(async () => {
    await query('DELETE FROM business_ext.contacts WHERE tenant_id IN ($1, $2)', [
      orgA.businessTenantId,
      orgB.businessTenantId,
    ]);
    await query("DELETE FROM business_ext.organization_mappings WHERE deployment_id = 'iso-test'");
  });

  it('allows Organization A to create and read its own contact', async () => {
    const contact = await crmService.createContact(orgA, {
      name: 'Alice Corp',
      email: 'alice@company-a.com',
      phone: '+14155550001',
      company: 'Company A LLC',
      role: 'CEO',
      status: 'qualified',
      lifecycleStatus: 'qualified',
    });

    expect(contact.id).toBeDefined();
    expect(contact.tenantId).toBe(orgA.businessTenantId);
    expect(contact.name).toBe('Alice Corp');
    expect(contact.leadScore).toBeGreaterThan(0);

    const fetched = await crmService.getContactById(orgA, contact.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(contact.id);
  });

  it('prohibits Organization B from seeing Organization A contacts in directory list', async () => {
    const orgBList = await crmService.getContacts(orgB);
    const found = orgBList.contacts.find((c) => c.email === 'alice@company-a.com');
    expect(found).toBeUndefined();
    expect(orgBList.total).toBe(0);
  });

  it('prohibits Organization B from reading Organization A contact by ID', async () => {
    const orgAList = await crmService.getContacts(orgA);
    const alice = orgAList.contacts[0];
    expect(alice).toBeDefined();

    const crossOrgFetch = await crmService.getContactById(orgB, alice!.id);
    expect(crossOrgFetch).toBeNull();
  });

  it('prohibits Organization B from mutating Organization A contact', async () => {
    const orgAList = await crmService.getContacts(orgA);
    const alice = orgAList.contacts[0];
    expect(alice).toBeDefined();

    expect(
      crmService.updateContact(orgB, alice!.id, {
        name: 'Hacked Name',
      })
    ).rejects.toThrow('Contact not found or unauthorized');

    // Confirm Organization A contact was untouched
    const verified = await crmService.getContactById(orgA, alice!.id);
    expect(verified?.name).toBe('Alice Corp');
  });

  it('prohibits Organization B from deleting Organization A contact', async () => {
    const orgAList = await crmService.getContacts(orgA);
    const alice = orgAList.contacts[0];
    expect(alice).toBeDefined();

    const deleteResult = await crmService.deleteContact(orgB, alice!.id);
    expect(deleteResult).toBe(false);

    // Verify contact still exists for Org A
    const stillExists = await crmService.getContactById(orgA, alice!.id);
    expect(stillExists).not.toBeNull();
  });

  it('allows same email/phone in different organizations without collision', async () => {
    // Org B creates contact with same email as Org A
    const orgBContact = await crmService.createContact(orgB, {
      name: 'Alice In Org B',
      email: 'alice@company-a.com', // identical email to Org A
      company: 'Branch B',
      status: 'new',
    });

    expect(orgBContact.id).toBeDefined();
    expect(orgBContact.tenantId).toBe(orgB.businessTenantId);

    // Both contacts coexist independently in their respective tenants
    const aList = await crmService.getContacts(orgA);
    const bList = await crmService.getContacts(orgB);

    expect(aList.contacts.length).toBe(1);
    expect(bList.contacts.length).toBe(1);
    expect(aList.contacts[0]!.tenantId).toBe(orgA.businessTenantId);
    expect(bList.contacts[0]!.tenantId).toBe(orgB.businessTenantId);
  });
});
