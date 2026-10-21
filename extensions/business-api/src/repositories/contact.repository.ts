import { query, withTransaction } from '../config/database';
import type {
  Contact,
  CreateContactDTO,
  UpdateContactDTO,
  LeadStatus,
  LeadLifecycleStatus,
  TimelineEvent,
} from '../domain/contact.types';

interface ContactRow {
  id: string;
  tenant_id: string;
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  status: LeadStatus;
  lifecycle_status: LeadLifecycleStatus;
  lead_score: number | null;
  estimated_value: string | null;
  tags: string[];
  notes: string;
  custom_fields: Record<string, unknown>;
  call_attempts: number;
  last_call_result: string | null;
  last_contacted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TimelineRow {
  id: string;
  tenant_id: string;
  contact_id: string;
  event: string;
  details: string;
  status: string;
  created_at: Date | string;
}

function mapContactRow(row: ContactRow, timeline: TimelineEvent[] = []): Contact {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    company: row.company,
    role: row.role,
    email: row.email,
    phone: row.phone,
    avatar: row.avatar,
    status: row.status,
    lifecycleStatus: row.lifecycle_status,
    leadScore: row.lead_score,
    estimatedValue: row.estimated_value,
    tags: row.tags || [],
    notes: row.notes || '',
    customFields: row.custom_fields || {},
    callAttempts: row.call_attempts || 0,
    lastCallResult: row.last_call_result,
    lastContactedAt: row.last_contacted_at
      ? row.last_contacted_at instanceof Date
        ? row.last_contacted_at.toISOString()
        : String(row.last_contacted_at)
      : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    timeline,
  };
}

function mapTimelineRow(row: TimelineRow): TimelineEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    contactId: row.contact_id,
    event: row.event,
    details: row.details,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function getContacts(
  tenantId: string,
  options?: {
    search?: string;
    status?: LeadStatus;
    lifecycleStatus?: LeadLifecycleStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ contacts: Contact[]; total: number }> {
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (options?.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(options.status);
  }

  if (options?.lifecycleStatus) {
    conditions.push(`lifecycle_status = $${paramIdx++}`);
    params.push(options.lifecycleStatus);
  }

  if (options?.search && options.search.trim()) {
    conditions.push(
      `(name ILIKE $${paramIdx} OR company ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR phone ILIKE $${paramIdx})`
    );
    params.push(`%${options.search.trim()}%`);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM business_ext.contacts WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const contactsRes = await query<ContactRow>(
    `SELECT * FROM business_ext.contacts 
     WHERE ${whereClause} 
     ORDER BY created_at DESC 
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  return {
    contacts: contactsRes.rows.map((r) => mapContactRow(r)),
    total,
  };
}

export async function getContactById(
  tenantId: string,
  id: string
): Promise<Contact | null> {
  const res = await query<ContactRow>(
    `SELECT * FROM business_ext.contacts WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, id]
  );
  if (res.rows.length === 0 || !res.rows[0]) return null;

  const timelineRes = await query<TimelineRow>(
    `SELECT * FROM business_ext.contact_timeline_events 
     WHERE tenant_id = $1 AND contact_id = $2 
     ORDER BY created_at DESC`,
    [tenantId, id]
  );

  const timeline = timelineRes.rows.map(mapTimelineRow);
  return mapContactRow(res.rows[0], timeline);
}

export async function findDuplicate(
  tenantId: string,
  email?: string | null,
  phone?: string | null
): Promise<Contact | null> {
  if (!email && !phone) return null;

  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  const matchers: string[] = [];
  if (email && email.trim()) {
    matchers.push(`LOWER(email) = LOWER($${paramIdx++})`);
    params.push(email.trim());
  }
  if (phone && phone.trim()) {
    matchers.push(`phone = $${paramIdx++}`);
    params.push(phone.trim());
  }

  if (matchers.length === 0) return null;
  conditions.push(`(${matchers.join(' OR ')})`);

  const res = await query<ContactRow>(
    `SELECT * FROM business_ext.contacts WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params
  );

  if (res.rows.length === 0 || !res.rows[0]) return null;
  return mapContactRow(res.rows[0]);
}

export async function createContact(
  tenantId: string,
  data: CreateContactDTO
): Promise<Contact> {
  return withTransaction(async (client) => {
    const res = await client.query<ContactRow>(
      `INSERT INTO business_ext.contacts (
        tenant_id, name, company, role, email, phone, avatar,
        status, lifecycle_status, lead_score, estimated_value, tags, notes, custom_fields
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *`,
      [
        tenantId,
        data.name,
        data.company || null,
        data.role || null,
        data.email?.toLowerCase().trim() || null,
        data.phone?.trim() || null,
        data.avatar || null,
        data.status || 'new',
        data.lifecycleStatus || 'new',
        data.leadScore ?? null,
        data.estimatedValue || null,
        data.tags || [],
        data.notes || '',
        JSON.stringify(data.customFields || {}),
      ]
    );

    const row = res.rows[0];
    if (!row) throw new Error('Failed to create contact');

    // Automatically append creation audit event
    const timelineRes = await client.query<TimelineRow>(
      `INSERT INTO business_ext.contact_timeline_events (
        tenant_id, contact_id, event, details, status
      ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        tenantId,
        row.id,
        'Lead Created',
        `Contact record initialized with status: ${row.status}`,
        row.lifecycle_status,
      ]
    );

    const timeline = timelineRes.rows.map(mapTimelineRow);
    return mapContactRow(row, timeline);
  });
}

export async function updateContact(
  tenantId: string,
  id: string,
  data: UpdateContactDTO
): Promise<Contact | null> {
  return withTransaction(async (client) => {
    const existing = await client.query<ContactRow>(
      `SELECT * FROM business_ext.contacts WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, id]
    );
    if (existing.rows.length === 0 || !existing.rows[0]) return null;
    const prev = existing.rows[0];

    const res = await client.query<ContactRow>(
      `UPDATE business_ext.contacts SET
        name = COALESCE($3, name),
        company = COALESCE($4, company),
        role = COALESCE($5, role),
        email = COALESCE($6, email),
        phone = COALESCE($7, phone),
        avatar = COALESCE($8, avatar),
        status = COALESCE($9, status),
        lifecycle_status = COALESCE($10, lifecycle_status),
        lead_score = COALESCE($11, lead_score),
        estimated_value = COALESCE($12, estimated_value),
        tags = COALESCE($13, tags),
        notes = COALESCE($14, notes),
        custom_fields = COALESCE($15, custom_fields),
        call_attempts = COALESCE($16, call_attempts),
        last_call_result = COALESCE($17, last_call_result),
        updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        data.name,
        data.company,
        data.role,
        data.email?.toLowerCase().trim(),
        data.phone?.trim(),
        data.avatar,
        data.status,
        data.lifecycleStatus,
        data.leadScore,
        data.estimatedValue,
        data.tags,
        data.notes,
        data.customFields ? JSON.stringify(data.customFields) : null,
        data.callAttempts,
        data.lastCallResult,
      ]
    );

    const updatedRow = res.rows[0];
    if (!updatedRow) return null;

    // If lifecycle status changed, record timeline event
    if (data.lifecycleStatus && data.lifecycleStatus !== prev.lifecycle_status) {
      await client.query(
        `INSERT INTO business_ext.contact_timeline_events (
          tenant_id, contact_id, event, details, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          id,
          `Lifecycle Status Changed to ${data.lifecycleStatus}`,
          `Transitioned from ${prev.lifecycle_status} to ${data.lifecycleStatus}`,
          data.lifecycleStatus,
        ]
      );
    }

    const timelineRes = await client.query<TimelineRow>(
      `SELECT * FROM business_ext.contact_timeline_events 
       WHERE tenant_id = $1 AND contact_id = $2 
       ORDER BY created_at DESC`,
      [tenantId, id]
    );

    return mapContactRow(updatedRow, timelineRes.rows.map(mapTimelineRow));
  });
}

export async function deleteContact(
  tenantId: string,
  id: string
): Promise<boolean> {
  const res = await query(
    `DELETE FROM business_ext.contacts WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function addTimelineEvent(
  tenantId: string,
  contactId: string,
  event: string,
  details: string,
  status: string
): Promise<TimelineEvent> {
  const res = await query<TimelineRow>(
    `INSERT INTO business_ext.contact_timeline_events (
      tenant_id, contact_id, event, details, status
    ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tenantId, contactId, event, details, status]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Failed to record timeline event');
  return mapTimelineRow(row);
}
