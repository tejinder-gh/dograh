import type { TenantContext } from '../domain/tenant-mapping.types';
import type {
  Appointment,
  CreateAppointmentInput,
  AvailabilityQueryInput,
  AvailableSlot,
  AppointmentStatus,
} from '../domain/appointment.types';
import {
  createAppointment,
  getAppointmentById,
  listAppointmentsByTenant,
  hasSlotCollision,
  updateAppointmentStatus,
  rescheduleAppointmentInDb,
} from '../repositories/appointment.repository';
import { query } from '../config/database';

export class SlotCollisionError extends Error {
  readonly statusCode = 409;
  constructor(message = 'Time slot conflict: The requested appointment slot is already booked.') {
    super(message);
    this.name = 'SlotCollisionError';
  }
}

export async function getAvailabilitySlots(
  tenantContext: TenantContext,
  input: AvailabilityQueryInput
): Promise<AvailableSlot[]> {
  const durationMs = (input.durationMinutes || 30) * 60 * 1000;
  
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
    const dayOfWeek = currentDate.getUTCDay();
    // Monday (1) through Friday (5) business hours: 9:00 AM - 5:00 PM UTC
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dayStart = new Date(currentDate);
      dayStart.setUTCHours(9, 0, 0, 0);

      const dayEnd = new Date(currentDate);
      dayEnd.setUTCHours(17, 0, 0, 0);

      let slotStart = new Date(dayStart);
      while (slotStart.getTime() + durationMs <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durationMs);

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
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);

  // Atomic conflict check
  const collision = await hasSlotCollision(tenantContext.businessTenantId, start, end);
  if (collision) {
    throw new SlotCollisionError();
  }

  // Create appointment
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
  const collision = await hasSlotCollision(
    tenantContext.businessTenantId,
    newStartTime,
    newEndTime,
    appointmentId
  );
  if (collision) {
    throw new SlotCollisionError();
  }

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
