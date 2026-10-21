import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { runMigrations } from '../../config/migrator';
import { closePool, query } from '../../config/database';
import { resolveTenantContext } from '../../services/tenant-mapping.service';
import * as tenantRepo from '../../repositories/tenant-mapping.repository';

describe('Integration: Multi-Tenant Organization Mapping', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    // Clean up test mappings
    await query("DELETE FROM business_ext.organization_mappings WHERE deployment_id = 'test-deploy'");
  });

  it('creates a durable, unique mapping for an Acuity organization', async () => {
    const deploymentId = 'test-deploy';
    const orgId = 101;

    const ctx1 = await resolveTenantContext(orgId, deploymentId);
    expect(ctx1.acuityOrganizationId).toBe(101);
    expect(ctx1.acuityOrganizationId).toBe(101);
    expect(ctx1.deploymentId).toBe('test-deploy');
    expect(ctx1.businessTenantId).toBeDefined();

    // Second call must return the exact same businessTenantId
    const ctx2 = await resolveTenantContext(orgId, deploymentId);
    expect(ctx2.businessTenantId).toBe(ctx1.businessTenantId);
  });

  it('generates distinct tenant IDs for different Acuity organizations', async () => {
    const deploymentId = 'test-deploy';
    const orgA = 201;
    const orgB = 202;

    const ctxA = await resolveTenantContext(orgA, deploymentId);
    const ctxB = await resolveTenantContext(orgB, deploymentId);

    expect(ctxA.businessTenantId).not.toBe(ctxB.businessTenantId);
  });

  it('enforces database-level uniqueness on (deployment_id, acuity_organization_id)', async () => {
    const deploymentId = 'test-deploy';
    const orgId = 301;

    const m1 = await tenantRepo.getOrCreateMapping(deploymentId, orgId);
    const m2 = await tenantRepo.getOrCreateMapping(deploymentId, orgId);

    expect(m1.id).toBe(m2.id);
    expect(m1.businessTenantId).toBe(m2.businessTenantId);
  });
});
