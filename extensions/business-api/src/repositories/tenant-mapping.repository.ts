import { query } from '../config/database';
import type { OrganizationMapping } from '../domain/tenant-mapping.types';

interface OrganizationMappingRow {
  id: string;
  deployment_id: string;
  acuity_organization_id: number;
  business_tenant_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRow(row: OrganizationMappingRow): OrganizationMapping {
  return {
    id: row.id,
    deploymentId: row.deployment_id,
    acuityOrganizationId: row.acuity_organization_id,
    businessTenantId: row.business_tenant_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function findByAcuityOrgId(
  deploymentId: string,
  acuityOrgId: number
): Promise<OrganizationMapping | null> {
  const res = await query<OrganizationMappingRow>(
    `SELECT * FROM business_ext.organization_mappings
     WHERE deployment_id = $1 AND acuity_organization_id = $2
     LIMIT 1`,
    [deploymentId, acuityOrgId]
  );
  if (res.rows.length === 0 || !res.rows[0]) return null;
  return mapRow(res.rows[0]);
}

export const findByDograhOrgId = findByAcuityOrgId;

export async function findByTenantId(
  tenantId: string
): Promise<OrganizationMapping | null> {
  const res = await query<OrganizationMappingRow>(
    `SELECT * FROM business_ext.organization_mappings
     WHERE business_tenant_id = $1
     LIMIT 1`,
    [tenantId]
  );
  if (res.rows.length === 0 || !res.rows[0]) return null;
  return mapRow(res.rows[0]);
}

export async function getOrCreateMapping(
  deploymentId: string,
  acuityOrgId: number
): Promise<OrganizationMapping> {
  // Use ON CONFLICT DO UPDATE to ensure durable single mapping per (deployment, org)
  const res = await query<OrganizationMappingRow>(
    `INSERT INTO business_ext.organization_mappings (deployment_id, acuity_organization_id)
     VALUES ($1, $2)
     ON CONFLICT (deployment_id, acuity_organization_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [deploymentId, acuityOrgId]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error(`Failed to resolve organization mapping for org ${acuityOrgId}`);
  }
  return mapRow(row);
}
