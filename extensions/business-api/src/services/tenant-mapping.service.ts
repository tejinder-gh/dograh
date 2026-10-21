import * as tenantRepo from '../repositories/tenant-mapping.repository';
import type { TenantContext } from '../domain/tenant-mapping.types';
import { env } from '../config/env';

export async function resolveTenantContext(
  acuityOrganizationId: number,
  deploymentId: string = env.ACUITY_DEPLOYMENT_ID || env.Acuity_DEPLOYMENT_ID
): Promise<TenantContext> {
  if (!acuityOrganizationId || acuityOrganizationId <= 0) {
    throw new Error(`Invalid Acuity organization ID: ${acuityOrganizationId}`);
  }

  const mapping = await tenantRepo.getOrCreateMapping(deploymentId, acuityOrganizationId);

  return {
    deploymentId: mapping.deploymentId,
    acuityOrganizationId: mapping.acuityOrganizationId,
    dograhOrganizationId: mapping.acuityOrganizationId,
    businessTenantId: mapping.businessTenantId,
  };
}
