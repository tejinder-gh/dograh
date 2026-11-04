import { Hono } from 'hono';
import {
  CreateAppointmentSchema,
  AvailabilityQuerySchema,
  UpdateAppointmentStatusSchema,
  RescheduleAppointmentSchema,
} from '../domain/appointment.types';
import {
  getAvailabilitySlots,
  bookAppointment,
  getAppointment,
  listAppointments,
  updateStatus,
  rescheduleAppointment,
  SlotCollisionError,
} from '../services/appointment.service';

export const appointmentRoutes = new Hono();

// List appointments
appointmentRoutes.get('/', async (c) => {
  const ctx = c.get('tenantContext');
  const contactId = c.req.query('contactId');
  const status = c.req.query('status');
  const startDateStr = c.req.query('startDate');
  const endDateStr = c.req.query('endDate');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
  const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0;

  const startDate = startDateStr ? new Date(startDateStr) : undefined;
  const endDate = endDateStr ? new Date(endDateStr) : undefined;

  const result = await listAppointments(ctx, {
    contactId,
    status,
    startDate,
    endDate,
    limit,
    offset,
  });

  return c.json({
    data: result.appointments,
    total: result.total,
    limit,
    offset,
  });
});

// Query available booking slots
appointmentRoutes.get('/availability', async (c) => {
  const ctx = c.get('tenantContext');
  const queryParams = {
    startDate: c.req.query('startDate') || new Date().toISOString(),
    endDate: c.req.query('endDate'),
    durationMinutes: c.req.query('durationMinutes') || 30,
    timezone: c.req.query('timezone') || 'America/New_York',
  };

  const parsed = AvailabilityQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const slots = await getAvailabilitySlots(ctx, parsed.data);
    return c.json({ data: slots });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query availability';
    return c.json({ error: message }, 500);
  }
});

// Book an appointment
appointmentRoutes.post('/', async (c) => {
  const ctx = c.get('tenantContext');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = CreateAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const appointment = await bookAppointment(ctx, parsed.data);
    return c.json({ data: appointment }, 201);
  } catch (error) {
    if (error instanceof SlotCollisionError) {
      return c.json({ error: error.message }, 409);
    }
    const message = error instanceof Error ? error.message : 'Failed to book appointment';
    return c.json({ error: message }, 500);
  }
});

// Get appointment by ID
appointmentRoutes.get('/:id', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');

  const appointment = await getAppointment(ctx, id);
  if (!appointment) {
    return c.json({ error: 'Appointment not found' }, 404);
  }

  return c.json({ data: appointment });
});

// Update appointment status (confirm, complete, cancel, no_show)
appointmentRoutes.patch('/:id/status', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = UpdateAppointmentStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const updated = await updateStatus(ctx, id, parsed.data.status, parsed.data.notes);
    return c.json({ data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update appointment';
    return c.json({ error: message }, 404);
  }
});

// Reschedule appointment
appointmentRoutes.patch('/:id/reschedule', async (c) => {
  const ctx = c.get('tenantContext');
  const id = c.req.param('id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = RescheduleAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const updated = await rescheduleAppointment(
      ctx,
      id,
      new Date(parsed.data.startTime),
      new Date(parsed.data.endTime),
      parsed.data.notes
    );
    return c.json({ data: updated });
  } catch (error) {
    if (error instanceof SlotCollisionError) {
      return c.json({ error: error.message }, 409);
    }
    const message = error instanceof Error ? error.message : 'Failed to reschedule appointment';
    return c.json({ error: message }, 400);
  }
});
