import { z } from 'zod';

export const AppointmentStatusSchema = z.enum([
  'requested',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
]);

export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

export class SlotCollisionError extends Error {
  readonly statusCode = 409;
  constructor(message = 'Time slot conflict: The requested appointment slot is already booked.') {
    super(message);
    this.name = 'SlotCollisionError';
  }
}

export const AppointmentSourceSchema = z.enum(['agent', 'manual', 'web']);
export type AppointmentSource = z.infer<typeof AppointmentSourceSchema>;

export const CreateAppointmentSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  acuityWorkflowId: z.number().int().optional().nullable(),
  acuityRunId: z.string().optional().nullable(),
  title: z.string().min(1, 'Title is required').max(255),
  startTime: z.string().datetime({ message: 'startTime must be valid ISO-8601 datetime' }),
  endTime: z.string().datetime({ message: 'endTime must be valid ISO-8601 datetime' }),
  source: AppointmentSourceSchema.default('agent'),
  resultingDealValue: z.number().nonnegative().default(0),
  notes: z.string().default(''),
}).refine(
  (data) => new Date(data.endTime) > new Date(data.startTime),
  { message: 'endTime must be after startTime', path: ['endTime'] }
);

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;

export const UpdateAppointmentStatusSchema = z.object({
  status: AppointmentStatusSchema,
  notes: z.string().optional(),
});

export type UpdateAppointmentStatusInput = z.infer<typeof UpdateAppointmentStatusSchema>;

export const RescheduleAppointmentSchema = z.object({
  startTime: z.string().datetime({ message: 'startTime must be valid ISO-8601 datetime' }),
  endTime: z.string().datetime({ message: 'endTime must be valid ISO-8601 datetime' }),
  notes: z.string().optional(),
}).refine(
  (data) => new Date(data.endTime) > new Date(data.startTime),
  { message: 'endTime must be after startTime', path: ['endTime'] }
);

export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentSchema>;

export const AvailabilityQuerySchema = z.object({
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  durationMinutes: z.coerce.number().int().min(15).max(180).default(30),
  timezone: z.string().default('America/New_York'),
});

export type AvailabilityQueryInput = z.infer<typeof AvailabilityQuerySchema>;

export interface Appointment {
  id: string;
  tenantId: string;
  contactId: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  acuityWorkflowId: number | null;
  acuityRunId: string | null;
  title: string;
  status: AppointmentStatus;
  startTime: string;
  endTime: string;
  source: AppointmentSource;
  resultingDealValue: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}
