import { query, withTransaction } from '../config/database';
import {
  type Appointment,
  type CreateAppointmentInput,
  type AppointmentStatus,
  SlotCollisionError,
} from '../domain/appointment.types';

interface AppointmentDbRow {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  acuity_workflow_id: number | null;
  acuity_run_id: string | null;
  title: string;
  status: string;
  start_time: Date | string;
  end_time: Date | string;
  source: string;
  resulting_deal_value: string | number;
  notes: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRowToAppointment(r: AppointmentDbRow): Appointment {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    contactId: r.contact_id,
    contactName: r.contact_name ?? null,
    contactEmail: r.contact_email ?? null,
    contactPhone: r.contact_phone ?? null,
    acuityWorkflowId: r.acuity_workflow_id,
    acuityRunId: r.acuity_run_id,
    title: r.title,
    status: r.status as Appointment['status'],
    startTime: new Date(r.start_time).toISOString(),
    endTime: new Date(r.end_time).toISOString(),
    source: r.source as Appointment['source'],
    resultingDealValue: Number(r.resulting_deal_value || 0),
    notes: r.notes || '',
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function hasSlotCollision(
  tenantId: string,
  startTime: Date,
  endTime: Date,
  excludeId?: string
): Promise<boolean> {
  const sql = `
    SELECT id
    FROM business_ext.appointments
    WHERE tenant_id = $1
      AND status NOT IN ('cancelled', 'no_show')
      AND start_time < $3
      AND end_time > $2
      ${excludeId ? 'AND id != $4' : ''}
    LIMIT 1;
  `;
  const params: unknown[] = [tenantId, startTime, endTime];
  if (excludeId) params.push(excludeId);

  const res = await query(sql, params);
  return (res.rowCount ?? 0) > 0;
}

export async function createAppointment(
  tenantId: string,
  input: CreateAppointmentInput
): Promise<Appointment> {
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);

  return withTransaction(async (client) => {
    // Acquire transaction-scoped advisory lock for this tenant's scheduling
    // Ensures atomic check-and-insert serialized per tenant, eliminating race conditions
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1));', [`apt_lock_${tenantId}`]);

    // Check collision under the advisory lock
    const collisionRes = await client.query(
      `SELECT id FROM business_ext.appointments
       WHERE tenant_id = $1
         AND status NOT IN ('cancelled', 'no_show')
         AND start_time < $3
         AND end_time > $2
       LIMIT 1;`,
      [tenantId, start, end]
    );

    if ((collisionRes.rowCount ?? 0) > 0) {
      throw new SlotCollisionError();
    }

    const sql = `
      INSERT INTO business_ext.appointments (
        tenant_id,
        contact_id,
        acuity_workflow_id,
        acuity_run_id,
        title,
        status,
        start_time,
        end_time,
        source,
        resulting_deal_value,
        notes
      ) VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    const values = [
      tenantId,
      input.contactId || null,
      input.acuityWorkflowId || null,
      input.acuityRunId || null,
      input.title,
      start,
      end,
      input.source || 'agent',
      input.resultingDealValue || 0,
      input.notes || '',
    ];

    const res = await client.query<AppointmentDbRow>(sql, values);
    const row = res.rows[0];
    if (!row) throw new Error('Failed to insert appointment record');
    return mapRowToAppointment(row);
  });
}

function isValidUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

export async function getAppointmentById(
  tenantId: string,
  appointmentId: string
): Promise<Appointment | null> {
  if (!isValidUuid(appointmentId)) return null;

  const sql = `
    SELECT 
      a.*,
      c.name AS contact_name,
      c.email AS contact_email,
      c.phone AS contact_phone
    FROM business_ext.appointments a
    LEFT JOIN business_ext.contacts c ON c.id = a.contact_id AND c.tenant_id = a.tenant_id
    WHERE a.tenant_id = $1 AND a.id = $2;
  `;
  const res = await query<AppointmentDbRow>(sql, [tenantId, appointmentId]);
  const row = res.rows[0];
  return row ? mapRowToAppointment(row) : null;
}

export async function listAppointmentsByTenant(
  tenantId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    contactId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ appointments: Appointment[]; total: number }> {
  const conditions = ['a.tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (options?.startDate) {
    conditions.push(`a.end_time >= $${paramIdx++}`);
    params.push(options.startDate);
  }
  if (options?.endDate) {
    conditions.push(`a.start_time <= $${paramIdx++}`);
    params.push(options.endDate);
  }
  if (options?.contactId) {
    conditions.push(`a.contact_id = $${paramIdx++}`);
    params.push(options.contactId);
  }
  if (options?.status) {
    conditions.push(`a.status = $${paramIdx++}`);
    params.push(options.status);
  }

  const whereClause = conditions.join(' AND ');

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM business_ext.appointments a WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  params.push(limit, offset);

  const listSql = `
    SELECT 
      a.*,
      c.name AS contact_name,
      c.email AS contact_email,
      c.phone AS contact_phone
    FROM business_ext.appointments a
    LEFT JOIN business_ext.contacts c ON c.id = a.contact_id AND c.tenant_id = a.tenant_id
    WHERE ${whereClause}
    ORDER BY a.start_time ASC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  const res = await query<AppointmentDbRow>(listSql, params);
  return {
    appointments: res.rows.map(mapRowToAppointment),
    total,
  };
}

export async function updateAppointmentStatus(
  tenantId: string,
  appointmentId: string,
  status: AppointmentStatus,
  notes?: string
): Promise<Appointment | null> {
  if (!isValidUuid(appointmentId)) return null;

  const sql = `
    UPDATE business_ext.appointments
    SET status = $1,
        notes = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE notes END,
        updated_at = NOW()
    WHERE tenant_id = $3 AND id = $4
    RETURNING *;
  `;
  const res = await query<AppointmentDbRow>(sql, [status, notes ?? null, tenantId, appointmentId]);
  const row = res.rows[0];
  return row ? mapRowToAppointment(row) : null;
}

export async function rescheduleAppointmentInDb(
  tenantId: string,
  appointmentId: string,
  newStartTime: Date,
  newEndTime: Date,
  notes?: string
): Promise<Appointment | null> {
  if (!isValidUuid(appointmentId)) return null;

  return withTransaction(async (client) => {
    // Advisory lock for tenant
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1));', [`apt_lock_${tenantId}`]);

    // Check collision under lock
    const collisionRes = await client.query(
      `SELECT id FROM business_ext.appointments
       WHERE tenant_id = $1
         AND id != $4
         AND status NOT IN ('cancelled', 'no_show')
         AND start_time < $3
         AND end_time > $2
       LIMIT 1;`,
      [tenantId, newStartTime, newEndTime, appointmentId]
    );

    if ((collisionRes.rowCount ?? 0) > 0) {
      throw new SlotCollisionError();
    }

    const sql = `
      UPDATE business_ext.appointments
      SET start_time = $1,
          end_time = $2,
          status = 'rescheduled',
          notes = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE notes END,
          updated_at = NOW()
      WHERE tenant_id = $4 AND id = $5
      RETURNING *;
    `;
    const res = await client.query<AppointmentDbRow>(sql, [
      newStartTime,
      newEndTime,
      notes ?? null,
      tenantId,
      appointmentId,
    ]);
    const row = res.rows[0];
    return row ? mapRowToAppointment(row) : null;
  });
}
