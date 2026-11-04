import type { TenantContext } from '../domain/tenant-mapping.types';
import {
  type Appointment,
  type CreateAppointmentInput,
  type AvailabilityQueryInput,
  type AvailableSlot,
  type AppointmentStatus,
  SlotCollisionError,
} from '../domain/appointment.types';
import {
  createAppointment,
  getAppointmentById,
  listAppointmentsByTenant,
  updateAppointmentStatus,
  rescheduleAppointmentInDb,
} from '../repositories/appointment.repository';
import { query } from '../config/database';

export { SlotCollisionError };

function getTargetTimezoneOffsetMs(date: Date, timeZone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const y = getPart('year');
    const m = getPart('month') - 1;
    const d = getPart('day');
    let h = getPart('hour');
    if (h === 24) h = 0;
    const targetAsUtc = Date.UTC(y, m, d, h, getPart('minute'), getPart('second'));
    return targetAsUtc - date.getTime();
  } catch {
    return 0; // Fallback to UTC if invalid timezone string
  }
}

export async function getAvailabilitySlots(
  tenantContext: TenantContext,
  input: AvailabilityQueryInput
): Promise<AvailableSlot[]> {
  const durationMs = (input.durationMinutes || 30) * 60 * 1000;
  const targetTimezone = input.timezone || 'America/New_York';
  
  // Parse start and end date
  let startDate = new Date(input.startDate);
  if (isNaN(startDate.getTime())) {
    startDate = new Date();
  }

  // End date defaults to 3 days out if not specified
  let endDate = input.endDate ? new Date(input.endDate) : new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
  if (isNaN(endDate.getTime())) {
    endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
  }

  // Fetch booked appointments in the target window
  const { appointments } = await listAppointmentsByTenant(tenantContext.businessTenantId, {
    startDate,
    endDate,
  });

  const slots: AvailableSlot[] = [];
  const currentDate = new Date(startDate);

  // Iterate day by day between startDate and endDate
  while (currentDate < endDate) {
    const offsetMs = getTargetTimezoneOffsetMs(currentDate, targetTimezone);
    const localizedDate = new Date(currentDate.getTime() + offsetMs);
    const dayOfWeek = localizedDate.getUTCDay();

    // Monday (1) through Friday (5) business hours: 9:00 AM - 5:00 PM in target timezone
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const year = localizedDate.getUTCFullYear();
      const month = localizedDate.getUTCMonth();
      const day = localizedDate.getUTCDate();

      // 9:00 AM local time in target timezone converted to UTC timestamp
      const dayStart = new Date(Date.UTC(year, month, day, 9, 0, 0) - offsetMs);
      // 5:00 PM (17:00) local time in target timezone converted to UTC timestamp
      const dayEnd = new Date(Date.UTC(year, month, day, 17, 0, 0) - offsetMs);

      let slotStart = new Date(dayStart);
      while (slotStart.getTime() + durationMs <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durationMs);

        // Slot must fall within requested [startDate, endDate] window
        if (slotStart >= startDate && slotEnd <= endDate) {
          // Check if overlaps with any active appointment
          const isOccupied = appointments.some((apt) => {
            if (apt.status === 'cancelled' || apt.status === 'no_show') return false;
            const aptStart = new Date(apt.startTime).getTime();
            const aptEnd = new Date(apt.endTime).getTime();
            return aptStart < slotEnd.getTime() && aptEnd > slotStart.getTime();
          });

          slots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            available: !isOccupied,
          });
        }

        // Advance by slot duration
        slotStart = new Date(slotStart.getTime() + durationMs);
      }
    }
    // Next day
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return slots;
}

export async function bookAppointment(
  tenantContext: TenantContext,
  input: CreateAppointmentInput
): Promise<Appointment> {
  // Create appointment atomically with advisory lock and collision check
  const appointment = await createAppointment(tenantContext.businessTenantId, input);

  // If bound to a contact, update contact lifecycle and append timeline audit event
  if (input.contactId) {
    await query(
      `UPDATE business_ext.contacts
       SET lifecycle_status = 'booked',
           status = 'booked',
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantContext.businessTenantId, input.contactId]
    );

    await query(
      `INSERT INTO business_ext.contact_timeline_events
       (tenant_id, contact_id, event, details, status)
       VALUES ($1, $2, 'appointment_booked', $3, 'booked')`,
      [
        tenantContext.businessTenantId,
        input.contactId,
        `Appointment "${appointment.title}" scheduled for ${appointment.startTime}`,
      ]
    );
  }

  return appointment;
}

export async function getAppointment(
  tenantContext: TenantContext,
  appointmentId: string
): Promise<Appointment | null> {
  return getAppointmentById(tenantContext.businessTenantId, appointmentId);
}

export async function listAppointments(
  tenantContext: TenantContext,
  options?: {
    startDate?: Date;
    endDate?: Date;
    contactId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ appointments: Appointment[]; total: number }> {
  return listAppointmentsByTenant(tenantContext.businessTenantId, options);
}

export async function updateStatus(
  tenantContext: TenantContext,
  appointmentId: string,
  status: AppointmentStatus,
  notes?: string
): Promise<Appointment> {
  const updated = await updateAppointmentStatus(
    tenantContext.businessTenantId,
    appointmentId,
    status,
    notes
  );
  if (!updated) {
    throw new Error(`Appointment ${appointmentId} not found`);
  }
  return updated;
}

export async function rescheduleAppointment(
  tenantContext: TenantContext,
  appointmentId: string,
  newStartTime: Date,
  newEndTime: Date,
  notes?: string
): Promise<Appointment> {
  const rescheduled = await rescheduleAppointmentInDb(
    tenantContext.businessTenantId,
    appointmentId,
    newStartTime,
    newEndTime,
    notes
  );
  if (!rescheduled) {
    throw new Error(`Appointment ${appointmentId} not found`);
  }
  return rescheduled;
}
