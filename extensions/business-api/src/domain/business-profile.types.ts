import { z } from 'zod';

export const operatingHoursSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required'), // e.g. "America/New_York", "UTC"
  schedule: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      slots: z.array(z.object({
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:mm required'),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:mm required'),
      })).default([]),
    })
  ).default({}),
});

export type OperatingHours = z.infer<typeof operatingHoursSchema>;

export const knowledgeSourceRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: z.enum(['document', 'url', 'faq_snippet', 'acuity_knowledge_base', 'acuity_knowledge_base']),
  verified: z.boolean().default(false),
  referenceUrl: z.string().url().optional(),
});

export type KnowledgeSourceRef = z.infer<typeof knowledgeSourceRefSchema>;

export const escalationPreferencesSchema = z.object({
  supervisorEmail: z.string().email().optional().or(z.literal('')),
  supervisorPhone: z.string().optional().or(z.literal('')),
  urgencyThreshold: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  autoNotify: z.boolean().default(true),
});

export type EscalationPreferences = z.infer<typeof escalationPreferencesSchema>;

export const businessProfileSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1, 'Business name is required').max(255),
  domain: z.string().min(1, 'Domain is required').max(255),
  industry: z.string().min(1, 'Industry is required').max(100),
  description: z.string().default(''),
  brandTone: z.string().min(1).default('Professional and empathetic'),
  websiteUrl: z.string().url().optional().or(z.literal('')).nullable(),
  inboundGoal: z.string().min(1).default('Resolve customer inquiries and qualify needs.'),
  outboundGoal: z.string().min(1).default('Assess prospect fit and schedule a consultation.'),
  operatingHours: operatingHoursSchema.default({
    timezone: 'UTC',
    schedule: {},
  }),
  knowledgeSources: z.array(knowledgeSourceRefSchema).default([]),
  escalationPreferences: escalationPreferencesSchema.default({
    supervisorEmail: '',
    supervisorPhone: '',
    urgencyThreshold: 'high',
    autoNotify: true,
  }),
  acuityWorkflowId: z.number().int().positive().nullable().default(null),
  AcuityWorkflowId: z.number().int().positive().nullable().default(null),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const createBusinessProfileSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(255),
  domain: z.string().min(1, 'Domain is required').max(255),
  industry: z.string().min(1, 'Industry is required').max(100),
  description: z.string().optional().default(''),
  brandTone: z.string().optional().default('Professional and empathetic'),
  websiteUrl: z.string().url().optional().or(z.literal('')).nullable(),
  inboundGoal: z.string().optional().default('Resolve customer inquiries and qualify needs.'),
  outboundGoal: z.string().optional().default('Assess prospect fit and schedule a consultation.'),
  operatingHours: operatingHoursSchema.optional().default({
    timezone: 'UTC',
    schedule: {},
  }),
  knowledgeSources: z.array(knowledgeSourceRefSchema).optional().default([]),
  escalationPreferences: escalationPreferencesSchema.optional().default({
    supervisorEmail: '',
    supervisorPhone: '',
    urgencyThreshold: 'high',
    autoNotify: true,
  }),
  acuityWorkflowId: z.number().int().positive().optional().nullable(),
  AcuityWorkflowId: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export type CreateBusinessProfileDTO = z.input<typeof createBusinessProfileSchema>;

export const updateBusinessProfileSchema = createBusinessProfileSchema.partial();
export type UpdateBusinessProfileDTO = z.input<typeof updateBusinessProfileSchema>;
