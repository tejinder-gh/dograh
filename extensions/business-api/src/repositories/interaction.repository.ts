import { query, withTransaction } from '../config/database';
import type {
  Interaction,
  CreateInteractionDTO,
  ChannelType,
  SentimentCategory,
  ChatMessage,
} from '../domain/interaction.types';

interface InteractionRow {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  acuity_workflow_id: number | null;
  acuity_definition_id: number | null;
  acuity_run_id: string | null;
  channel: ChannelType;
  duration_seconds: number;
  sentiment_score: number;
  sentiment_category: SentimentCategory;
  was_escalated: boolean;
  escalation_reason: string | null;
  summary: string;
  transcript: ChatMessage[];
  created_at: Date | string;
}

function mapRow(row: InteractionRow): Interaction {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    contactId: row.contact_id,
    acuityWorkflowId: row.acuity_workflow_id,
    acuityDefinitionId: row.acuity_definition_id,
    acuityRunId: row.acuity_run_id,
    AcuityWorkflowId: row.acuity_workflow_id,
    AcuityDefinitionId: row.acuity_definition_id,
    AcuityRunId: row.acuity_run_id,
    channel: row.channel,
    durationSeconds: row.duration_seconds,
    sentimentScore: row.sentiment_score,
    sentimentCategory: row.sentiment_category,
    wasEscalated: row.was_escalated,
    escalationReason: row.escalation_reason,
    summary: row.summary,
    transcript: row.transcript || [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function getInteractions(
  tenantId: string,
  options?: {
    contactId?: string;
    acuityRunId?: string;
    AcuityRunId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Interaction[]> {
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (options?.contactId) {
    conditions.push(`contact_id = $${paramIdx++}`);
    params.push(options.contactId);
  }

  const runId = options?.acuityRunId ?? options?.acuityRunId;
  if (runId) {
    conditions.push(`acuity_run_id = $${paramIdx++}`);
    params.push(runId);
  }

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const res = await query<InteractionRow>(
    `SELECT * FROM business_ext.interactions
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  return res.rows.map(mapRow);
}

export async function getInteractionById(
  tenantId: string,
  id: string
): Promise<Interaction | null> {
  const res = await query<InteractionRow>(
    `SELECT * FROM business_ext.interactions WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, id]
  );
  if (res.rows.length === 0 || !res.rows[0]) return null;
  return mapRow(res.rows[0]);
}

export async function createInteraction(
  tenantId: string,
  data: CreateInteractionDTO
): Promise<Interaction> {
  return withTransaction(async (client) => {
    // 1. Verify contact belongs to this tenant if provided
    let contactId = data.contactId || null;
    if (contactId) {
      const contactCheck = await client.query(
        `SELECT id FROM business_ext.contacts WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, contactId]
      );
      if (contactCheck.rows.length === 0) {
        contactId = null; // Foreign contact or not found in this tenant
      }
    }

    const workflowId = data.acuityWorkflowId ?? data.acuityWorkflowId ?? null;
    const definitionId = data.acuityDefinitionId ?? data.acuityDefinitionId ?? null;
    const runId = data.acuityRunId ?? data.acuityRunId ?? null;

    // 2. Insert interaction
    const res = await client.query<InteractionRow>(
      `INSERT INTO business_ext.interactions (
        tenant_id, contact_id, acuity_workflow_id, acuity_definition_id,
        acuity_run_id, channel, duration_seconds, sentiment_score,
        sentiment_category, was_escalated, escalation_reason, summary, transcript
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12, $13
      ) RETURNING *`,
      [
        tenantId,
        contactId,
        workflowId,
        definitionId,
        runId,
        data.channel || 'call_inbound',
        data.durationSeconds || 0,
        data.sentimentScore ?? 50,
        data.sentimentCategory || 'neutral',
        data.wasEscalated || false,
        data.escalationReason || null,
        data.summary || '',
        JSON.stringify(data.transcript || []),
      ]
    );

    const row = res.rows[0];
    if (!row) throw new Error('Failed to record interaction');

    // 3. If linked to contact, append timeline event and update last contacted time & call attempts
    if (contactId) {
      await client.query(
        `INSERT INTO business_ext.contact_timeline_events (
          tenant_id, contact_id, event, details, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          contactId,
          `Interaction Completed (${data.channel || 'call'} - ${data.durationSeconds || 0}s)`,
          data.summary ? `Summary: ${data.summary}` : `Sentiment: ${data.sentimentCategory || 'neutral'}`,
          data.wasEscalated ? 'escalated' : 'connected',
        ]
      );

      await client.query(
        `UPDATE business_ext.contacts SET
          call_attempts = call_attempts + 1,
          last_contacted_at = NOW(),
          last_call_result = $3,
          updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, contactId, data.wasEscalated ? 'escalated' : 'connected']
      );
    }

    return mapRow(row);
  });
}
