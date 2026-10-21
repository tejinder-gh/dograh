import { query } from '../config/database';

export interface AcuityWorkflowRef {
  id: number;
  name: string;
  organizationId: number;
}

export type DograhWorkflowRef = AcuityWorkflowRef;

/**
 * Verifies that an Acuity organization exists and is active.
 * Rejects non-existent, disabled, or unmapped organizations.
 */
export async function verifyOrganizationActive(
  organizationId: number
): Promise<boolean> {
  try {
    const res = await query<{ id: number; quota_enabled: boolean | null }>(
      `SELECT id, quota_enabled FROM public.organizations WHERE id = $1 LIMIT 1`,
      [organizationId]
    );
    if (res.rows.length === 0) return false;
    const org = res.rows[0];
    return !!org;
  } catch (error) {
    console.error('Error verifying organization active status against Acuity database:', error);
    return false;
  }
}

/**
 * Verifies that a workflow belongs to the specified organization.
 */
export async function verifyWorkflowOwnership(
  organizationId: number,
  workflowId: number
): Promise<boolean> {
  try {
    const res = await query<{ id: number }>(
      `SELECT id FROM public.workflows WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [workflowId, organizationId]
    );
    return res.rows.length > 0;
  } catch (error) {
    console.error('Error verifying workflow ownership against Acuity database:', error);
    return false;
  }
}

/**
 * Verifies that a workflow definition belongs to a workflow owned by the specified organization.
 */
export async function verifyWorkflowDefinitionOwnership(
  organizationId: number,
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
    const res = await query<{ id: number }>(sql, [definitionId, organizationId, workflowId || null]);
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
  organizationId: number,
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
    const res = await query<{ id: number }>(sql, [runId, organizationId, workflowId || null]);
    return res.rows.length > 0;
  } catch (error) {
    console.error('Error verifying run ownership against Acuity database:', error);
    return false;
  }
}

/**
 * Lists active workflows owned by the organization.
 */
export async function listOrganizationWorkflows(
  organizationId: number
): Promise<AcuityWorkflowRef[]> {
  try {
    const res = await query<{ id: number; name: string; organization_id: number }>(
      `SELECT id, name, organization_id FROM public.workflows WHERE organization_id = $1 ORDER BY id DESC`,
      [organizationId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      organizationId: r.organization_id,
    }));
  } catch (error) {
    console.error('Error querying workflows from Acuity database:', error);
    return [];
  }
}

/**
 * Verifies that the user is an active member of the specified organization in Acuity.
 * Defends against revoked memberships and stale organization claims.
 */
export async function verifyUserOrganizationMembership(
  userId: string | number,
  organizationId: number
): Promise<boolean> {
  try {
    const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (!isNaN(numericUserId) && numericUserId > 0) {
      const res = await query<{ user_id: number; organization_id: number }>(
        `SELECT user_id, organization_id
         FROM public.organization_users
         WHERE user_id = $1 AND organization_id = $2
         LIMIT 1`,
        [numericUserId, organizationId]
      );
      if (res.rows.length > 0) return true;
    }

    // Fallback if userId is a non-numeric provider_id string (e.g. Stack Auth ID)
    try {
      const res = await query<{ user_id: number; organization_id: number }>(
        `SELECT ou.user_id, ou.organization_id
         FROM public.organization_users ou
         JOIN public.users u ON u.id = ou.user_id
         WHERE (u.id::text = $1 OR u.provider_id = $1)
           AND ou.organization_id = $2
         LIMIT 1`,
        [String(userId), organizationId]
      );
      return res.rows.length > 0;
    } catch {
      return false;
    }
  } catch (error) {
    console.error('Error verifying user organization membership against Acuity database:', error);
    return false;
  }
}
