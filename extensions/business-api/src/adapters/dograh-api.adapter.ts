import { query } from '../config/database';

export interface DograhWorkflowRef {
  id: number;
  name: string;
  organizationId: number;
}

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
