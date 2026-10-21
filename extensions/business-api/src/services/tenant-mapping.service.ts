import * as tenantRepo from '../repositories/tenant-mapping.repository';
import type { TenantContext } from '../domain/tenant-mapping.types';
import { env } from '../config/env';

export async function resolveTenantContext(
  dograhOrganizationId: number,
  deploymentId: string = env.DOGRAH_DEPLOYMENT_ID
): Promise<TenantContext> {
  if (!dograhOrganizationId || dograhOrganizationId <= 0) {
    throw new Error(`Invalid Dograh organization ID: ${dograhOrganizationId}`);
  }

  const mapping = await tenantRepo.getOrCreateMapping(deploymentId, dograhOrganizationId);

  return {
    deploymentId: mapping.deploymentId,
    dograhOrganizationId: mapping.dograhOrganizationId,
    businessTenantId: mapping.businessTenantId,
  };
}
