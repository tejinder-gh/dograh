import { withTenantContext } from '../connection';
import { CustomerContact, LeadTimelineEvent } from '../../types';

interface ContactRow {
  id: string;
  tenant_id: string;
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar?: string | null;
  status: CustomerContact['status'];
  lead_score?: number | null;
  estimated_value?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  bant?: any;
  lifecycle_status: CustomerContact['leadLifecycleStatus'];
  call_attempts: number;
  last_call_result?: string | null;
  created_at: string | Date;
  last_contacted_at?: string | Date | null;
}

interface TimelineRow {
  id: string;
  tenant_id: string;
  contact_id: string;
  event: string;
  details?: string | null;
  status: string;
  created_at: string | Date;
}

function rowToContact(row: ContactRow, timeline: LeadTimelineEvent[] = []): CustomerContact {
  return {
    id: row.id,
    name: row.name,
    company: row.company || undefined,
    role: row.role || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    avatar: row.avatar || undefined,
    status: row.status,
    leadScore: typeof row.lead_score === 'number' ? row.lead_score : 50,
    estimatedValue: row.estimated_value || undefined,
    tags: row.tags || [],
    notes: row.notes || '',
    bant: row.bant || undefined,
    leadLifecycleStatus: row.lifecycle_status,
    callAttempts: row.call_attempts || 0,
    lastCallResult: (row.last_call_result as any) || undefined,
    leadAuditTimeline: timeline,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    lastContactedAt: row.last_contacted_at instanceof Date ? row.last_contacted_at.toISOString() : (row.last_contacted_at ? String(row.last_contacted_at) : undefined),
  };
}

export async function getContacts(tenantId: string): Promise<CustomerContact[]> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const contactsResult = await client.query<ContactRow>(
      `SELECT * FROM contacts WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );

    if (contactsResult.rows.length === 0) return [];

    const contactIds = contactsResult.rows.map((r) => r.id);
    const timelineResult = await client.query<TimelineRow>(
      `SELECT * FROM lead_timeline_events 
       WHERE tenant_id = $1 AND contact_id = ANY($2::uuid[])
       ORDER BY created_at DESC`,
      [tenantId, contactIds]
    );

    const timelineMap = new Map<string, LeadTimelineEvent[]>();
    for (const t of timelineResult.rows) {
      const list = timelineMap.get(t.contact_id) || [];
      list.push({
        timestamp: t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
        event: t.event,
        details: t.details || '',
        status: t.status as any,
      });
      timelineMap.set(t.contact_id, list);
    }

    return contactsResult.rows.map((row) => rowToContact(row, timelineMap.get(row.id) || []));
  });
}

export async function getContactById(tenantId: string, id: string): Promise<CustomerContact | null> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query<ContactRow>(
      `SELECT * FROM contacts WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    if (res.rows.length === 0) return null;

    const timelineRes = await client.query<TimelineRow>(
      `SELECT * FROM lead_timeline_events WHERE tenant_id = $1 AND contact_id = $2 ORDER BY created_at DESC`,
      [tenantId, id]
    );

    const timeline: LeadTimelineEvent[] = timelineRes.rows.map((t) => ({
      timestamp: t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
      event: t.event,
      details: t.details || '',
      status: t.status as any,
    }));

    return rowToContact(res.rows[0], timeline);
  });
}

export async function createContact(
  tenantId: string,
  data: Partial<CustomerContact>
): Promise<CustomerContact> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query<ContactRow>(
      `INSERT INTO contacts (
        tenant_id, name, company, role, email, phone, avatar,
        status, lead_score, estimated_value, tags, notes, bant,
        lifecycle_status, call_attempts, last_call_result, created_at, last_contacted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, NOW(), NOW()
      ) RETURNING *`,
      [
        tenantId,
        data.name || 'New Lead',
        data.company || null,
        data.role || null,
        data.email || null,
        data.phone || null,
        data.avatar || null,
        data.status || 'new',
        typeof data.leadScore === 'number' ? data.leadScore : null,
        data.estimatedValue || null,
        data.tags || [],
        data.notes || '',
        data.bant ? JSON.stringify(data.bant) : null,
        data.leadLifecycleStatus || 'new',
        data.callAttempts || 0,
        data.lastCallResult || null,
      ]
    );

    const contactRow = res.rows[0];

    const timelineEvent: LeadTimelineEvent = {
      timestamp: new Date().toISOString(),
      event: 'Lead Ingested into AI Calling Agent OS',
      details: data.bant?.budget ? `Initial BANT qualification budget: ${data.bant.budget}.` : 'Lead record created.',
      status: data.leadLifecycleStatus || 'new',
    };

    await client.query(
      `INSERT INTO lead_timeline_events (tenant_id, contact_id, event, details, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [tenantId, contactRow.id, timelineEvent.event, timelineEvent.details, timelineEvent.status]
    );

    return rowToContact(contactRow, [timelineEvent]);
  });
}

export async function updateContact(
  tenantId: string,
  id: string,
  data: Partial<CustomerContact>
): Promise<CustomerContact | null> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query<ContactRow>(
      `UPDATE contacts SET
        name = COALESCE($3, name),
        company = COALESCE($4, company),
        role = COALESCE($5, role),
        email = COALESCE($6, email),
        phone = COALESCE($7, phone),
        status = COALESCE($8, status),
        lead_score = COALESCE($9, lead_score),
        estimated_value = COALESCE($10, estimated_value),
        notes = COALESCE($11, notes),
        lifecycle_status = COALESCE($12, lifecycle_status),
        last_contacted_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        data.name,
        data.company,
        data.role,
        data.email,
        data.phone,
        data.status,
        data.leadScore,
        data.estimatedValue,
        data.notes,
        data.leadLifecycleStatus,
      ]
    );

    if (res.rows.length === 0) return null;

    if (data.leadLifecycleStatus) {
      await client.query(
        `INSERT INTO lead_timeline_events (tenant_id, contact_id, event, details, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          tenantId,
          id,
          `Status changed to ${data.leadLifecycleStatus}`,
          data.notes || '',
          data.leadLifecycleStatus,
        ]
      );
    }

    return getContactById(tenantId, id);
  });
}

export async function batchCreateContacts(
  tenantId: string,
  contacts: Partial<CustomerContact>[]
): Promise<{ inserted: number; errors: string[] }> {
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    try {
      await createContact(tenantId, c);
      inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${i + 1} (${c.name || 'unnamed'}): ${msg}`);
    }
  }

  return { inserted, errors };
}
