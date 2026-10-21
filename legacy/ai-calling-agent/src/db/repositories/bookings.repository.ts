import { withTenantContext } from '../connection';
import { ScheduledSession } from '../../types';

export class BookingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingConflictError';
  }
}

export class BookingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingNotFoundError';
  }
}

export class BookingRepresentativeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingRepresentativeNotFoundError';
  }
}

export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingValidationError';
  }
}

interface SessionRow {
  id: string;
  tenant_id: string;
  contact_id: string;
  contact_name?: string;
  contact_company?: string;
  contact_email?: string;
  contact_phone?: string;
  representative_id?: string;
  rep_name?: string;
  rep_role?: string;
  rep_avatar?: string;
  date: string | Date;
  time_slot: string;
  duration_minutes: number;
  meeting_type: string;
  status: ScheduledSession['status'];
  agenda_notes?: string;
  calendar_invite_sent: boolean;
  external_calendar_event_id?: string;
  external_calendar_link?: string;
  idempotency_key?: string;
  created_at: string | Date;
}

function rowToSession(row: SessionRow): ScheduledSession {
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contact_name || 'Prospect',
    company: row.contact_company || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    representativeId: row.representative_id || '',
    representativeName: row.rep_name || '',
    representativeRole: row.rep_role || '',
    representativeAvatar: row.rep_avatar || '',
    date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0],
    timeSlot: row.time_slot,
    durationMinutes: row.duration_minutes || 30,
    meetingType: row.meeting_type || '30-min Discovery',
    status: row.status,
    agendaNotes: row.agenda_notes || '',
    calendarInviteSent: row.calendar_invite_sent || false,
    googleCalendarEventId: row.external_calendar_event_id || undefined,
    googleCalendarLink: row.external_calendar_link || undefined,
    domainId: row.tenant_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/**
 * Retrieves all bookings for a tenant, enforcing tenant-isolated composite joins under strict RLS.
 */
export async function getBookings(tenantId: string): Promise<ScheduledSession[]> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query<SessionRow>(
      `SELECT s.*, 
              c.name as contact_name, c.company as contact_company, c.email as contact_email, c.phone as contact_phone,
              r.name as rep_name, r.role as rep_role, r.avatar as rep_avatar
       FROM scheduled_sessions s
       LEFT JOIN contacts c ON s.contact_id = c.id AND c.tenant_id = s.tenant_id
       LEFT JOIN representatives r ON s.representative_id = r.id AND r.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
       ORDER BY s.date DESC, s.created_at DESC`,
      [tenantId]
    );

    return res.rows.map(rowToSession);
  });
}

export async function getBookingById(
  tenantId: string,
  id: string
): Promise<ScheduledSession | null> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query<SessionRow>(
      `SELECT s.*, 
              c.name as contact_name, c.company as contact_company, c.email as contact_email, c.phone as contact_phone,
              r.name as rep_name, r.role as rep_role, r.avatar as rep_avatar
       FROM scheduled_sessions s
       LEFT JOIN contacts c ON s.contact_id = c.id AND c.tenant_id = s.tenant_id
       LEFT JOIN representatives r ON s.representative_id = r.id AND r.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1 AND s.id = $2`,
      [tenantId, id]
    );

    if (res.rows.length === 0) return null;
    return rowToSession(res.rows[0]);
  });
}

/**
 * Creates a scheduled session with:
 * 1. Idempotency protection.
 * 2. Strict tenant-scoped contact and representative validation.
 * 3. Double-booking conflict prevention.
 * 4. Pending confirmation workflow.
 */
export async function createBooking(
  tenantId: string,
  data: Partial<ScheduledSession> & { idempotencyKey?: string }
): Promise<ScheduledSession> {
  return withTenantContext(tenantId, undefined, async (client) => {
    // 0. Idempotency Check
    if (data.idempotencyKey) {
      const existing = await client.query<SessionRow>(
        `SELECT s.*, 
                c.name as contact_name, c.company as contact_company, c.email as contact_email, c.phone as contact_phone,
                r.name as rep_name, r.role as rep_role, r.avatar as rep_avatar
         FROM scheduled_sessions s
         LEFT JOIN contacts c ON s.contact_id = c.id AND c.tenant_id = s.tenant_id
         LEFT JOIN representatives r ON s.representative_id = r.id AND r.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1 AND s.idempotency_key = $2`,
        [tenantId, data.idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return rowToSession(existing.rows[0]);
      }
    }

    // 1. Resolve and validate contact in this tenant
    let contactId = data.contactId;
    if (contactId) {
      const contactCheck = await client.query(
        'SELECT id, name, company, email, phone FROM contacts WHERE tenant_id = $1 AND id = $2',
        [tenantId, contactId]
      );
      if (contactCheck.rows.length === 0) {
        contactId = undefined; // Contact ID is foreign or does not exist in this tenant
      }
    }

    if (!contactId) {
      // Create new contact without fabricated data
      const newContact = await client.query(
        `INSERT INTO contacts (tenant_id, name, company, email, phone, status, lead_lifecycle_status)
         VALUES ($1, $2, $3, $4, $5, 'appointment_pending', 'appointment_pending')
         RETURNING id`,
        [
          tenantId,
          data.contactName || 'Inbound Prospect',
          data.company || null,
          data.contactEmail || null,
          data.contactPhone || null,
        ]
      );
      contactId = newContact.rows[0].id;
    }

    // 2. Resolve and validate representative in this tenant
    let repId = data.representativeId;
    if (repId) {
      const repCheck = await client.query(
        'SELECT id FROM representatives WHERE tenant_id = $1 AND id = $2',
        [tenantId, repId]
      );
      if (repCheck.rows.length === 0) {
        throw new BookingRepresentativeNotFoundError(
          `Representative "${repId}" was not found in this tenant organization.`
        );
      }
    } else {
      // Pick active representative assigned to this tenant
      const repCheck = await client.query(
        'SELECT id FROM representatives WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1',
        [tenantId]
      );
      if (repCheck.rows.length > 0) {
        repId = repCheck.rows[0].id;
      } else {
        throw new BookingRepresentativeNotFoundError(
          'No representative is configured for this tenant organization. A representative must be registered before booking sessions.'
        );
      }
    }

    if (!data.date || !data.timeSlot) {
      throw new BookingValidationError('Both date and timeSlot are required to schedule a session.');
    }

    const bookingDate = data.date;
    const timeSlot = data.timeSlot;

    // 3. Conflict Prevention Check: Prevent duplicate bookings for same rep and slot
    const conflictCheck = await client.query(
      `SELECT id FROM scheduled_sessions
       WHERE tenant_id = $1
         AND representative_id = $2
         AND date = $3
         AND time_slot = $4
         AND status IN ('confirmed', 'pending_confirmation')
       FOR UPDATE`,
      [tenantId, repId, bookingDate, timeSlot]
    );

    if (conflictCheck.rows.length > 0) {
      throw new BookingConflictError(
        `Representative is already booked for date "${bookingDate}" at time slot "${timeSlot}". Please select another slot.`
      );
    }

    // 4. Insert scheduled session in pending_confirmation status
    const initialStatus: ScheduledSession['status'] = data.status || 'pending_confirmation';

    const insertResult = await client.query<SessionRow>(
      `INSERT INTO scheduled_sessions (
        tenant_id, contact_id, representative_id, date, time_slot,
        duration_minutes, meeting_type, status, agenda_notes,
        calendar_invite_sent, external_calendar_event_id, external_calendar_link,
        idempotency_key, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, NOW()
      ) RETURNING *`,
      [
        tenantId,
        contactId,
        repId,
        bookingDate,
        timeSlot,
        data.durationMinutes || 30,
        data.meetingType || '30-min Discovery',
        initialStatus,
        data.agendaNotes || '',
        data.calendarInviteSent || false,
        data.googleCalendarEventId || null,
        data.googleCalendarLink || null,
        data.idempotencyKey || null,
      ]
    );

    // 5. Update contact status: booked only if confirmed, otherwise appointment_pending
    const targetStatus = initialStatus === 'confirmed' ? 'booked' : 'appointment_pending';
    await client.query(
      `UPDATE contacts SET
        status = $1,
        lead_lifecycle_status = $1,
        last_contacted_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [targetStatus, tenantId, contactId]
    );

    // 6. Return fully populated session
    const fetchSession = await client.query<SessionRow>(
      `SELECT s.*, 
              c.name as contact_name, c.company as contact_company, c.email as contact_email, c.phone as contact_phone,
              r.name as rep_name, r.role as rep_role, r.avatar as rep_avatar
       FROM scheduled_sessions s
       LEFT JOIN contacts c ON s.contact_id = c.id AND c.tenant_id = s.tenant_id
       LEFT JOIN representatives r ON s.representative_id = r.id AND r.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1 AND s.id = $2`,
      [tenantId, insertResult.rows[0].id]
    );

    return rowToSession(fetchSession.rows[0]);
  });
}

/**
 * Authoritatively confirms a session after provider acknowledgment.
 */
export async function confirmBooking(
  tenantId: string,
  id: string,
  externalCalendarEventId?: string,
  externalCalendarLink?: string
): Promise<ScheduledSession> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query<SessionRow>(
      `UPDATE scheduled_sessions
       SET status = 'confirmed',
           calendar_invite_sent = true,
           external_calendar_event_id = COALESCE($3, external_calendar_event_id),
           external_calendar_link = COALESCE($4, external_calendar_link)
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, externalCalendarEventId || null, externalCalendarLink || null]
    );

    if (res.rows.length === 0) {
      throw new BookingNotFoundError(`Booking "${id}" not found in tenant "${tenantId}".`);
    }

    const sessionRow = res.rows[0];
    if (sessionRow.contact_id) {
      await client.query(
        `UPDATE contacts
         SET status = 'booked',
             lead_lifecycle_status = 'booked',
             lead_score = LEAST(100, COALESCE(lead_score, 50) + 15)
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, sessionRow.contact_id]
      );
    }

    const full = await getBookingById(tenantId, id);
    return full!;
  });
}

/**
 * Compensating rollback action: cancels a pending reservation when external provider fails.
 */
export async function cancelPendingBooking(
  tenantId: string,
  id: string,
  reason?: string
): Promise<boolean> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `UPDATE scheduled_sessions
       SET status = 'cancelled',
           agenda_notes = CASE 
             WHEN $3::text IS NOT NULL THEN COALESCE(agenda_notes, '') || ' [CANCELLED: ' || $3 || ']'
             ELSE agenda_notes
           END
       WHERE tenant_id = $1 AND id = $2 AND status = 'pending_confirmation'`,
      [tenantId, id, reason || null]
    );
    return (res.rowCount ?? 0) > 0;
  });
}

export async function updateBookingStatus(
  tenantId: string,
  id: string,
  status: ScheduledSession['status']
): Promise<ScheduledSession | null> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `UPDATE scheduled_sessions
       SET status = $3
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, status]
    );

    if (res.rows.length === 0) return null;
    return getBookingById(tenantId, id);
  });
}
