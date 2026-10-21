import { withSystemContext, withTenantContext } from '../connection';

export interface PromptTemplate {
  id: string;
  tenant_id?: string;
  agent_id?: string;
  layer: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface PromptVersion {
  id: string;
  prompt_template_id: string;
  version_number: number;
  prompt_text: string;
  change_summary?: string;
  is_approved: boolean;
  approved_by?: string;
  created_at: string;
}

export async function getPromptTemplates(tenantId?: string): Promise<PromptTemplate[]> {
  if (tenantId) {
    return withTenantContext(tenantId, undefined, async (client) => {
      const res = await client.query<PromptTemplate>(
        `SELECT * FROM prompt_templates 
         WHERE (tenant_id = $1 OR tenant_id IS NULL) AND is_active = true
         ORDER BY created_at ASC`,
        [tenantId]
      );
      return res.rows;
    });
  }
  return withSystemContext(async (client) => {
    const res = await client.query<PromptTemplate>(
      `SELECT * FROM prompt_templates 
       WHERE tenant_id IS NULL AND is_active = true
       ORDER BY created_at ASC`
    );
    return res.rows;
  });
}

export async function getActivePromptVersion(templateId: string): Promise<PromptVersion | null> {
  return withSystemContext(async (client) => {
    const res = await client.query(
      `SELECT * FROM prompt_versions 
       WHERE prompt_template_id = $1 AND is_approved = true
       ORDER BY version_number DESC
       LIMIT 1`,
      [templateId]
    );
    return res.rows[0] || null;
  });
}

export async function createPromptVersion(
  templateId: string,
  promptText: string,
  changeSummary?: string,
  approvedBy?: string
): Promise<PromptVersion> {
  return withSystemContext(async (client) => {
    // Get next version number
    const verRes = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) as max_ver FROM prompt_versions WHERE prompt_template_id = $1`,
      [templateId]
    );
    const nextVer = (verRes.rows[0]?.max_ver || 0) + 1;

    const res = await client.query(
      `INSERT INTO prompt_versions (prompt_template_id, version_number, prompt_text, change_summary, is_approved, approved_by, created_at)
       VALUES ($1, $2, $3, $4, true, $5, NOW())
       RETURNING *`,
      [templateId, nextVer, promptText, changeSummary || null, approvedBy || null]
    );
    return res.rows[0];
  });
}
