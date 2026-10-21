import { z } from 'zod';

export const AppointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

export const AppointmentSourceSchema = z.enum(['agent', 'manual', 'web']);
export type AppointmentSource = z.infer<typeof AppointmentSourceSchema>;

export const AppointmentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  acuityWorkflowId: z.number().int().nullable().optional(),
  acuityRunId: z.string().nullable().optional(),
  title: z.string().min(1).max(255),
  status: AppointmentStatusSchema,
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  source: AppointmentSourceSchema.default('agent'),
  resultingDealValue: z.number().nullable().optional(),
  notes: z.string().default(''),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Appointment = z.infer<typeof AppointmentSchema>;

export const CreateAppointmentSchema = AppointmentSchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
