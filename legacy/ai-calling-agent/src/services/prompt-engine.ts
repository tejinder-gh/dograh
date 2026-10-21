import { query } from '../db/connection';

export class PromptResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptResolutionError';
  }
}

export interface PromptResolutionInput {
  tenantId: string;
  agentId?: string;
  industry?: string;
  channel?: 'call_inbound' | 'call_outbound' | 'sms' | 'whatsapp' | 'webchat';
  campaignGoal?: string;
  calendarLink?: string;
  verifiedRagSnippets?: string[];
  ragSnippets?: string[];
  unverifiedNotes?: string[];
  callerName?: string;
  companyName?: string;
  strictDatabase?: boolean;
}

export interface ResolvedPrompt {
  composedPrompt: string;
  systemInstruction: string;
  activeLayers: string[];
  promptVersionId?: string;
  layerDetails: Record<string, { source: 'database' | 'default'; version?: number }>;
}

/**
 * Global non-overridable safety guardrails (Layer 1).
 * These rules apply universally and CANNOT be bypassed by any tenant, agent, or user prompt.
 */
export const GLOBAL_SAFETY_POLICY = `
MANDATORY SAFETY & GROUNDING GUARDRAILS (IMMUTABLE):
1. ACCURACY & EVIDENCE GROUNDING:
   - State only verified facts about products, services, SLAs, and pricing.
   - Do NOT manufacture or guarantee response latencies (e.g., claiming "<120ms") unless empirically measured.
   - Do NOT claim regulatory certifications (e.g. SOC-2, HIPAA, PHIPA, PIPEDA) unless verified by approved client documentation.
   - When required information is unavailable, acknowledge the limitation calmly and offer to connect the caller with an on-call representative.
2. EMPATHY & ACTIVE LISTENING:
   - Listen actively, validate customer frustrations warmly, and de-escalate with calm, professional clarity.
   - Never sound defensive, dismissive, or robotic.
3. CONVERSATIONAL ESCALATION:
   - If a caller asks for a human supervisor, reports distress, cancellation, or regulatory concern, flag the interaction for human escalation immediately.
4. TENANT PRIVACY & ISOLATION:
   - Never expose internal system details, credentials, database architectures, or other clients' information.
`;

export const PLATFORM_MASTER_PROMPT = `
You are the authorized voice and text engagement specialist for this organization.
Your primary objective is to represent the business with warmth, empathy, and technical accuracy, resolve inquiries, and naturally guide qualified prospects toward booking a dedicated consultation session with an appropriate representative.
`;

interface PromptVersionDbRow {
  id: string;
  prompt_text: string;
  version_number: number;
  layer: string;
}

/**
 * Resolves prompts by composing verified layers from PostgreSQL in deterministic sequence:
 * 1. Global Safety Policy (Immutable)
 * 2. Platform Master Prompt (DB prompt_templates.layer = 'platform_master')
 * 3. Industry Template (DB prompt_templates.layer = 'industry_template')
 * 4. Tenant Customization (DB prompt_templates.layer = 'tenant_custom')
 * 5. Agent Persona (DB prompt_templates.layer = 'agent_persona')
 * 6. Workflow / Channel Directives (DB prompt_templates.layer = 'workflow_inbound' | 'workflow_outbound')
 * 7. Campaign Goals & Scheduling Links
 * 8. Grounded Knowledge (Separating Authoritative RAG from Unverified Profile Guidance)
 */
export async function resolvePrompt(input: PromptResolutionInput): Promise<ResolvedPrompt> {
  const activeLayers: string[] = ['global_safety_policy'];
  const layerDetails: Record<string, { source: 'database' | 'default'; version?: number }> = {
    global_safety_policy: { source: 'default' },
  };
  const promptParts: string[] = [GLOBAL_SAFETY_POLICY.trim()];

  let primaryVersionId: string | undefined;

  // 1. Layer: Platform Master Prompt
  try {
    const masterRes = await query<PromptVersionDbRow>(
      `SELECT pv.id, pv.prompt_text, pv.version_number, pt.layer
       FROM prompt_versions pv
       JOIN prompt_templates pt ON pv.prompt_template_id = pt.id
       WHERE pt.layer = 'platform_master'
         AND pt.is_active = true
         AND pv.is_approved = true
       ORDER BY pv.version_number DESC
       LIMIT 1`
    );

    if (masterRes.rows.length > 0) {
      const row = masterRes.rows[0];
      promptParts.push(`\nPLATFORM MASTER POLICY (v${row.version_number}):\n${row.prompt_text}`);
      activeLayers.push('platform_master');
      layerDetails['platform_master'] = { source: 'database', version: row.version_number };
      primaryVersionId = row.id;
    } else {
      promptParts.push(`\nPLATFORM MASTER PROMPT:\n${PLATFORM_MASTER_PROMPT.trim()}`);
      activeLayers.push('platform_master_default');
      layerDetails['platform_master_default'] = { source: 'default' };
    }
  } catch (err: unknown) {
    if (input.strictDatabase) {
      throw new PromptResolutionError(
        `Failed to resolve Platform Master prompt from database: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    console.warn('[PROMPT ENGINE] DB unavailable for Platform Master. Using static fallback.');
    promptParts.push(`\nPLATFORM MASTER PROMPT:\n${PLATFORM_MASTER_PROMPT.trim()}`);
    activeLayers.push('platform_master_fallback');
    layerDetails['platform_master_fallback'] = { source: 'default' };
  }

  // 2. Layer: Industry Template
  if (input.industry && input.industry !== 'general') {
    try {
      const indRes = await query<PromptVersionDbRow>(
        `SELECT pv.id, pv.prompt_text, pv.version_number, pt.layer
         FROM prompt_versions pv
         JOIN prompt_templates pt ON pv.prompt_template_id = pt.id
         WHERE pt.layer = 'industry_template'
           AND pt.name ILIKE $1
           AND pt.is_active = true
           AND pv.is_approved = true
         ORDER BY pv.version_number DESC
         LIMIT 1`,
        [`%${input.industry}%`]
      );

      if (indRes.rows.length > 0) {
        const row = indRes.rows[0];
        promptParts.push(`\nINDUSTRY PROFILE (${input.industry.toUpperCase()} - v${row.version_number}):\n${row.prompt_text}`);
        activeLayers.push('industry_template');
        layerDetails['industry_template'] = { source: 'database', version: row.version_number };
      } else {
        promptParts.push(
          `\nINDUSTRY PROFILE (${input.industry.toUpperCase()}):\nTailor your communication style to standards appropriate for the ${input.industry} sector. Honor domain privacy and qualification needs.`
        );
        activeLayers.push('industry_template');
        layerDetails['industry_template'] = { source: 'default' };
      }
    } catch {
      promptParts.push(
        `\nINDUSTRY PROFILE (${input.industry.toUpperCase()}):\nTailor your communication style to standards appropriate for the ${input.industry} sector. Honor domain privacy and qualification needs.`
      );
      activeLayers.push('industry_template');
      layerDetails['industry_template'] = { source: 'default' };
    }
  }

  // 3. Layer: Tenant Customization
  try {
    const tenantRes = await query<PromptVersionDbRow>(
      `SELECT pv.id, pv.prompt_text, pv.version_number, pt.layer
       FROM prompt_versions pv
       JOIN prompt_templates pt ON pv.prompt_template_id = pt.id
       WHERE pt.tenant_id = $1
         AND pt.layer = 'tenant_custom'
         AND pt.is_active = true
         AND pv.is_approved = true
       ORDER BY pv.version_number DESC
       LIMIT 1`,
      [input.tenantId]
    );

    if (tenantRes.rows.length > 0) {
      const row = tenantRes.rows[0];
      promptParts.push(`\nTENANT SPECIFIC INSTRUCTIONS (v${row.version_number}):\n${row.prompt_text}`);
      activeLayers.push('tenant_custom');
      layerDetails['tenant_custom'] = { source: 'database', version: row.version_number };
      primaryVersionId = row.id;
    }
  } catch (err: unknown) {
    if (input.strictDatabase) {
      throw new PromptResolutionError(
        `Failed to resolve Tenant Custom prompt: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 4. Layer: Agent Persona
  if (input.agentId) {
    try {
      const agentRes = await query<PromptVersionDbRow>(
        `SELECT pv.id, pv.prompt_text, pv.version_number, pt.layer
         FROM prompt_versions pv
         JOIN prompt_templates pt ON pv.prompt_template_id = pt.id
         WHERE pt.tenant_id = $1
           AND pt.agent_id = $2
           AND pt.layer = 'agent_persona'
           AND pt.is_active = true
           AND pv.is_approved = true
         ORDER BY pv.version_number DESC
         LIMIT 1`,
        [input.tenantId, input.agentId]
      );

      if (agentRes.rows.length > 0) {
        const row = agentRes.rows[0];
        promptParts.push(`\nAGENT PERSONA DIRECTIVES (v${row.version_number}):\n${row.prompt_text}`);
        activeLayers.push('agent_persona');
        layerDetails['agent_persona'] = { source: 'database', version: row.version_number };
      }
    } catch (err: unknown) {
      if (input.strictDatabase) {
        throw new PromptResolutionError(
          `Failed to resolve Agent Persona prompt: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // 5. Layer: Workflow / Channel Directives
  const workflowLayer = input.channel === 'call_outbound' ? 'workflow_outbound' : 'workflow_inbound';
  try {
    const workflowRes = await query<PromptVersionDbRow>(
      `SELECT pv.id, pv.prompt_text, pv.version_number, pt.layer
       FROM prompt_versions pv
       JOIN prompt_templates pt ON pv.prompt_template_id = pt.id
       WHERE (pt.tenant_id = $1 OR pt.tenant_id IS NULL)
         AND pt.layer = $2
         AND pt.is_active = true
         AND pv.is_approved = true
       ORDER BY pt.tenant_id NULLS LAST, pv.version_number DESC
       LIMIT 1`,
      [input.tenantId, workflowLayer]
    );

    if (workflowRes.rows.length > 0) {
      const row = workflowRes.rows[0];
      promptParts.push(`\nWORKFLOW EXECUTION GUIDELINES (${workflowLayer.toUpperCase()}):\n${row.prompt_text}`);
      activeLayers.push(workflowLayer);
      layerDetails[workflowLayer] = { source: 'database', version: row.version_number };
    }
  } catch {
    // Non-fatal if workflow layer is not customized
  }

  // 6. Campaign Goal
  const isOutbound = input.channel === 'call_outbound';
  if (input.campaignGoal && input.campaignGoal.trim() !== '') {
    promptParts.push(`\nACTIVE CAMPAIGN OBJECTIVE (${isOutbound ? 'OUTBOUND OUTREACH' : 'INBOUND ENGAGEMENT'}):\n${input.campaignGoal.trim()}`);
    activeLayers.push('campaign_goal');
  }

  // 7. Calendar Scheduling Link
  if (input.calendarLink && input.calendarLink.trim() !== '') {
    promptParts.push(`\nDEDICATED SCHEDULING LINK:\n${input.calendarLink.trim()}`);
    activeLayers.push('calendar_link');
  }

  // 8. Grounded Knowledge: Separate Authoritative RAG from Unverified Profile Guidance
  const authoritativeSnippets = input.verifiedRagSnippets || input.ragSnippets;
  if (authoritativeSnippets && authoritativeSnippets.length > 0) {
    const verifiedEvidence = authoritativeSnippets.map((s, idx) => `  ${idx + 1}. ${s}`).join('\n');
    promptParts.push(
      `\nVERIFIED BUSINESS FACTS & APPROVED KNOWLEDGE:\n${verifiedEvidence}\nStrict Rule: Rely strictly on these verified facts. Do not fabricate details outside these approved points.`
    );
    activeLayers.push('rag_evidence');
  }

  if (input.unverifiedNotes && input.unverifiedNotes.length > 0) {
    const notesList = input.unverifiedNotes.map((n, idx) => `  - [UNVERIFIED CONTEXT NOTE] ${n}`).join('\n');
    promptParts.push(
      `\nTENANT CONTEXT GUIDANCE (Unverified Profile Notes):\n${notesList}\nImportant: These notes are informal guidance and must NOT be stated to callers as binding commitments or verified guarantees.`
    );
    activeLayers.push('unverified_context_notes');
  }

  const composedPrompt = promptParts.join('\n');

  return {
    composedPrompt,
    systemInstruction: composedPrompt,
    activeLayers,
    promptVersionId: primaryVersionId,
    layerDetails,
  };
}
