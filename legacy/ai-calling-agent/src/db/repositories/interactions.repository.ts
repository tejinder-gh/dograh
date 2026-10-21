import { withTenantContext } from '../connection';
import { InteractionLog, ChatMessage } from '../../types';

interface InteractionRow {
  id: string;
  tenant_id: string;
  contact_id?: string | null;
  agent_id?: string | null;
  channel: InteractionLog['channel'];
  duration_seconds: number;
  sentiment_score: number;
  sentiment_category: InteractionLog['sentimentCategory'];
  was_escalated: boolean;
  escalation_reason?: string | null;
  summary?: string | null;
  raw_transcript?: any;
  booked_session_id?: string | null;
  created_at: string | Date;
  contact_name?: string | null;
  contact_company?: string | null;
  contact_avatar?: string | null;
}

function rowToInteraction(row: InteractionRow): InteractionLog {
  return {
    id: row.id,
    contactId: row.contact_id || '',
    contactName: row.contact_name || 'Caller',
    contactCompany: row.contact_company || '',
    contactAvatar: row.contact_avatar || '',
    channel: row.channel,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    durationSeconds: row.duration_seconds || 0,
    sentimentScore: row.sentiment_score,
    sentimentCategory: row.sentiment_category,
    wasEscalated: row.was_escalated,
    escalationReason: row.escalation_reason || undefined,
    summary: row.summary || '',
    transcript: (row.raw_transcript as ChatMessage[]) || [],
    bookedSessionId: row.booked_session_id || undefined,
  };
}

export async function getInteractions(
  tenantId: string,
  limit: number = 50
): Promise<InteractionLog[]> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query<InteractionRow>(
      `SELECT i.*, c.name as contact_name, c.company as contact_company, c.avatar as contact_avatar
       FROM interactions i
       LEFT JOIN contacts c ON i.contact_id = c.id AND c.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1
       ORDER BY i.created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return res.rows.map(rowToInteraction);
  });
}

export async function getInteractionById(
  tenantId: string,
  id: string
): Promise<InteractionLog | null> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query<InteractionRow>(
      `SELECT i.*, c.name as contact_name, c.company as contact_company, c.avatar as contact_avatar
       FROM interactions i
       LEFT JOIN contacts c ON i.contact_id = c.id AND c.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.id = $2`,
      [tenantId, id]
    );

    if (res.rows.length === 0) return null;
    return rowToInteraction(res.rows[0]);
  });
}

export async function createInteraction(
  tenantId: string,
  data: Partial<InteractionLog>
): Promise<InteractionLog> {
  return withTenantContext(tenantId, undefined, async (client) => {
    // 1. Resolve contact or link to existing tenant contact
    let contactId = data.contactId;
    if (contactId) {
      const contactCheck = await client.query(
        'SELECT id FROM contacts WHERE tenant_id = $1 AND id = $2',
        [tenantId, contactId]
      );
      if (contactCheck.rows.length === 0) {
        contactId = undefined; // Contact ID is foreign or does not exist in this tenant
      }
    }

    // 2. Insert interaction without fabricating fake contact details
    const res = await client.query<InteractionRow>(
      `INSERT INTO interactions (
        tenant_id, contact_id, channel, duration_seconds,
        sentiment_score, sentiment_category, was_escalated,
        escalation_reason, summary, raw_transcript, booked_session_id, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11, NOW()
      ) RETURNING *`,
      [
        tenantId,
        contactId || null,
        data.channel || 'call_inbound',
        data.durationSeconds || 0,
        typeof data.sentimentScore === 'number' ? data.sentimentScore : 50,
        data.sentimentCategory || 'neutral',
        data.wasEscalated || false,
        data.escalationReason || null,
        data.summary || '',
        JSON.stringify(data.transcript || []),
        data.bookedSessionId || null,
      ]
    );

    const inserted = res.rows[0];

    // If contact exists, append timeline event
    if (contactId) {
      await client.query(
        `INSERT INTO lead_timeline_events (tenant_id, contact_id, event, details, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          tenantId,
          contactId,
          `${data.channel || 'Interaction'} Completed (${data.durationSeconds || 0}s)`,
          data.summary || 'Customer interaction recorded by AI Agent OS.',
          data.wasEscalated ? 'escalated' : 'contacted',
        ]
      );
    }

    return getInteractionById(tenantId, inserted.id) as Promise<InteractionLog>;
  });
}
