import { z } from 'zod';

export const leadStatusSchema = z.enum([
  'new',
  'contacted',
  'qualified',
  'nurturing',
  'booked',
  'closed',
]);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const leadLifecycleStatusSchema = z.enum([
  'new',
  'queued_outbound',
  'calling',
  'connected',
  'qualified',
  'booked',
  'escalated',
  'failed_retry',
  'closed',
]);
export type LeadLifecycleStatus = z.infer<typeof leadLifecycleStatusSchema>;

export const timelineEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  contactId: z.string().uuid(),
  event: z.string().min(1),
  details: z.string().default(''),
  status: z.string(),
  createdAt: z.string().datetime(),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const contactSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1, 'Contact name is required').max(255),
  company: z.string().max(255).nullable().optional(),
  role: z.string().max(100).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  avatar: z.string().nullable().optional(),
  status: leadStatusSchema.default('new'),
  lifecycleStatus: leadLifecycleStatusSchema.default('new'),
  leadScore: z.number().int().min(0).max(100).nullable().optional(),
  estimatedValue: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().default(''),
  customFields: z.record(z.string(), z.unknown()).default({}),
  callAttempts: z.number().int().min(0).default(0),
  lastCallResult: z.string().nullable().optional(),
  lastContactedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  timeline: z.array(timelineEventSchema).optional().default([]),
});

export type Contact = z.infer<typeof contactSchema>;

export const createContactSchema = z.object({
  name: z.string().min(1, 'Contact name is required').max(255),
  company: z.string().max(255).optional().nullable(),
  role: z.string().max(100).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable(),
  avatar: z.string().optional().nullable(),
  status: leadStatusSchema.optional().default('new'),
  lifecycleStatus: leadLifecycleStatusSchema.optional().default('new'),
  leadScore: z.number().int().min(0).max(100).optional().nullable(),
  estimatedValue: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
  customFields: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreateContactDTO = z.input<typeof createContactSchema>;

export const updateContactSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  company: z.string().max(255).optional().nullable(),
  role: z.string().max(100).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable(),
  avatar: z.string().optional().nullable(),
  status: leadStatusSchema.optional(),
  lifecycleStatus: leadLifecycleStatusSchema.optional(),
  leadScore: z.number().int().min(0).max(100).optional().nullable(),
  estimatedValue: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  callAttempts: z.number().int().min(0).optional(),
  lastCallResult: z.string().optional().nullable(),
});

export type UpdateContactDTO = z.input<typeof updateContactSchema>;

export const batchCreateContactsSchema = z.object({
  contacts: z.array(createContactSchema).min(1, 'At least one contact is required').max(500),
  deduplicateBy: z.enum(['email', 'phone', 'both', 'none']).default('both'),
});

export type BatchCreateContactsDTO = z.input<typeof batchCreateContactsSchema>;
