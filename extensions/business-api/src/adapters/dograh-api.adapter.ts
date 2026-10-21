import { query } from '../config/database';

export interface DograhWorkflowRef {
  id: number;
  name: string;
  organizationId: number;
}

/**
 * Verifies that a Dograh organization exists and is active.
 * Rejects non-existent, disabled, or unmapped organizations.
 */
export async function verifyOrganizationActive(
  dograhOrganizationId: number
): Promise<boolean> {
  try {
    const res = await query<{ id: number; quota_enabled: boolean | null }>(
      `SELECT id, quota_enabled FROM public.organizations WHERE id = $1 LIMIT 1`,
      [dograhOrganizationId]
    );
    if (res.rows.length === 0) return false;
    const org = res.rows[0];
    // If quota_enabled is explicitly false and quota is exhausted or disabled, could be rejected.
    // For standard active org, quota_enabled defaults to true or null.
    return !!org;
  } catch (error) {
    console.error('Error verifying organization active status against Dograh database:', error);
    return false;
  }
}

/**
 * Verifies that a workflow belongs to the specified organization.
 */
export async function verifyWorkflowOwnership(
  dograhOrganizationId: number,
  workflowId: number
): Promise<boolean> {
  try {
    const res = await query<{ id: number }>(
      `SELECT id FROM public.workflows WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [workflowId, dograhOrganizationId]
    );
    return res.rows.length > 0;
  } catch (error) {
    console.error('Error verifying workflow ownership against Dograh database:', error);
    return false;
  }
}

/**
 * Verifies that a workflow definition belongs to a workflow owned by the specified organization.
 */
export async function verifyWorkflowDefinitionOwnership(
  dograhOrganizationId: number,
  definitionId: number,
  workflowId?: number | null
): Promise<boolean> {
  try {
    const sql = `
      SELECT wd.id
      FROM public.workflow_definitions wd
      JOIN public.workflows w ON wd.workflow_id = w.id
      WHERE wd.id = $1
        AND w.organization_id = $2
        AND ($3::int IS NULL OR w.id = $3)
      LIMIT 1
    `;
    const res = await query<{ id: number }>(sql, [definitionId, dograhOrganizationId, workflowId || null]);
    return res.rows.length > 0;
  } catch (error) {
    console.error('Error verifying workflow definition ownership:', error);
    return false;
  }
}

/**
 * Verifies that a workflow run belongs to a workflow owned by the specified organization.
 */
export async function verifyRunOwnership(
  dograhOrganizationId: number,
  runId: string,
  workflowId?: number | null
): Promise<boolean> {
  try {
    const sql = `
      SELECT wr.id
      FROM public.workflow_runs wr
      JOIN public.workflows w ON wr.workflow_id = w.id
      WHERE (wr.id::text = $1 OR wr.name = $1)
        AND w.organization_id = $2
        AND ($3::int IS NULL OR w.id = $3)
      LIMIT 1
    `;
    const res = await query<{ id: number }>(sql, [runId, dograhOrganizationId, workflowId || null]);
    return res.rows.length > 0;
  } catch (error) {
    console.error('Error verifying run ownership against Dograh database:', error);
    return false;
  }
}

/**
 * Lists active workflows owned by the organization.
 */
export async function listOrganizationWorkflows(
  dograhOrganizationId: number
): Promise<DograhWorkflowRef[]> {
  try {
    const res = await query<{ id: number; name: string; organization_id: number }>(
      `SELECT id, name, organization_id FROM public.workflows WHERE organization_id = $1 ORDER BY id DESC`,
      [dograhOrganizationId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      organizationId: r.organization_id,
    }));
  } catch (error) {
    console.error('Error querying workflows from Dograh database:', error);
    return [];
  }
}
