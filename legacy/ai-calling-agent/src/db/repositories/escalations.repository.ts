import { withTenantContext } from '../connection';
import { EscalationTicket, EscalationPerson } from '../../types';

function rowToTicket(row: any): EscalationTicket {
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contact_name || 'Customer',
    customerCompany: row.contact_company || 'Enterprise Lead',
    channel: row.channel,
    triggeredAt: row.triggered_at ? new Date(row.triggered_at).toISOString() : new Date().toISOString(),
    urgencyLevel: row.urgency_level,
    status: row.status,
    sentimentScore: row.sentiment_score,
    triggerReason: row.trigger_reason,
    supervisorNotes: row.supervisor_notes || undefined,
    slaMinutesRemaining: row.sla_minutes_remaining || 15,
  };
}

export async function getEscalationTickets(tenantId: string): Promise<EscalationTicket[]> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `SELECT e.*, c.name as contact_name, c.company as contact_company
       FROM escalation_tickets e
       LEFT JOIN contacts c ON e.contact_id = c.id AND c.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1
       ORDER BY e.triggered_at DESC`,
      [tenantId]
    );
    return res.rows.map(rowToTicket);
  });
}

export async function createEscalationTicket(
  tenantId: string,
  data: Partial<EscalationTicket> & { contactEmail?: string; contactPhone?: string }
): Promise<EscalationTicket> {
  return withTenantContext(tenantId, undefined, async (client) => {
    // Resolve or link contact
    let contactId = data.contactId;
    if (contactId) {
      const check = await client.query(
        'SELECT id FROM contacts WHERE tenant_id = $1 AND id = $2',
        [tenantId, contactId]
      );
      if (check.rows.length === 0) {
        contactId = undefined;
      }
    }

    if (!contactId) {
      const newC = await client.query(
        `INSERT INTO contacts (tenant_id, name, company, email, phone, status, lead_score)
         VALUES ($1, $2, $3, $4, $5, 'new', 30)
         RETURNING id`,
        [
          tenantId,
          data.contactName || 'Escalated Customer',
          data.customerCompany || null,
          data.contactEmail || null,
          data.contactPhone || null,
        ]
      );
      contactId = newC.rows[0].id;
    }

    const res = await client.query(
      `INSERT INTO escalation_tickets (
        tenant_id, contact_id, channel, urgency_level, status,
        sentiment_score, trigger_reason, supervisor_notes, sla_minutes_remaining, triggered_at
      ) VALUES (
        $1, $2, $3, $4, 'pending',
        $5, $6, $7, $8, NOW()
      ) RETURNING *`,
      [
        tenantId,
        contactId,
        data.channel || 'call_inbound',
        data.urgencyLevel || 'high',
        typeof data.sentimentScore === 'number' ? data.sentimentScore : -50,
        data.triggerReason || 'Automatic sentiment threshold trigger',
        data.supervisorNotes || null,
        data.slaMinutesRemaining || 15,
      ]
    );

    return {
      ...rowToTicket(res.rows[0]),
      contactName: data.contactName || 'Customer',
      customerCompany: data.customerCompany || 'Enterprise Prospect',
    };
  });
}

export async function resolveEscalationTicket(
  tenantId: string,
  id: string,
  notes: string
): Promise<EscalationTicket | null> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `UPDATE escalation_tickets
       SET status = 'resolved',
           supervisor_notes = $3,
           resolved_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, notes]
    );

    if (res.rows.length === 0) return null;
    return rowToTicket(res.rows[0]);
  });
}

export async function getEscalationPersonnel(tenantId: string): Promise<EscalationPerson[]> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `SELECT * FROM escalation_personnel WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenantId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      phone: r.phone || '',
      email: r.email,
      tier: r.tier,
      channels: r.channels || ['sms', 'call'],
      activeOnCall: r.active_on_call,
    }));
  });
}

export async function createEscalationPerson(
  tenantId: string,
  person: Partial<EscalationPerson>
): Promise<EscalationPerson> {
  if (!person.name || !person.email) {
    throw new Error('Personnel name and email are required');
  }

  const name = person.name.trim();
  const email = person.email.trim();

  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `INSERT INTO escalation_personnel (
        tenant_id, name, role, phone, email, tier, channels, active_on_call, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      ) RETURNING *`,
      [
        tenantId,
        name,
        person.role?.trim() || 'Escalation Supervisor',
        person.phone?.trim() || null,
        email,
        person.tier || 'Tier 1 Support Lead',
        person.channels || ['sms', 'call'],
        person.activeOnCall !== false,
      ]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      phone: r.phone || '',
      email: r.email,
      tier: r.tier,
      channels: r.channels,
      activeOnCall: r.active_on_call,
    };
  });
}
