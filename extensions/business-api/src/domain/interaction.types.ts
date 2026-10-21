import { z } from 'zod';

export const channelTypeSchema = z.enum([
  'call_inbound',
  'call_outbound',
  'sms',
  'whatsapp',
  'webchat',
]);
export type ChannelType = z.infer<typeof channelTypeSchema>;

export const sentimentCategorySchema = z.enum([
  'positive',
  'neutral',
  'frustrated',
  'critical',
]);
export type SentimentCategory = z.infer<typeof sentimentCategorySchema>;

export const chatMessageSchema = z.object({
  id: z.string().optional(),
  speaker: z.enum(['agent', 'customer', 'system']),
  text: z.string(),
  timestamp: z.string(),
  sentiment: z.number().min(-100).max(100).optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const interactionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  acuityWorkflowId: z.number().int().positive().nullable().optional(),
  acuityDefinitionId: z.number().int().positive().nullable().optional(),
  acuityRunId: z.string().max(255).nullable().optional(),
  dograhWorkflowId: z.number().int().positive().nullable().optional(),
  dograhDefinitionId: z.number().int().positive().nullable().optional(),
  dograhRunId: z.string().max(255).nullable().optional(),
  channel: channelTypeSchema.default('call_inbound'),
  durationSeconds: z.number().int().min(0).default(0),
  sentimentScore: z.number().int().min(-100).max(100).default(50),
  sentimentCategory: sentimentCategorySchema.default('neutral'),
  wasEscalated: z.boolean().default(false),
  escalationReason: z.string().nullable().optional(),
  summary: z.string().default(''),
  transcript: z.array(chatMessageSchema).default([]),
  createdAt: z.string().datetime(),
});

export type Interaction = z.infer<typeof interactionSchema>;

export const createInteractionSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  acuityWorkflowId: z.number().int().positive().optional().nullable(),
  acuityDefinitionId: z.number().int().positive().optional().nullable(),
  acuityRunId: z.string().max(255).optional().nullable(),
  dograhWorkflowId: z.number().int().positive().optional().nullable(),
  dograhDefinitionId: z.number().int().positive().optional().nullable(),
  dograhRunId: z.string().max(255).optional().nullable(),
  channel: channelTypeSchema.optional().default('call_inbound'),
  durationSeconds: z.number().int().min(0).optional().default(0),
  sentimentScore: z.number().int().min(-100).max(100).optional().default(50),
  sentimentCategory: sentimentCategorySchema.optional().default('neutral'),
  wasEscalated: z.boolean().optional().default(false),
  escalationReason: z.string().optional().nullable(),
  summary: z.string().optional().default(''),
  transcript: z.array(chatMessageSchema).optional().default([]),
});

export type CreateInteractionDTO = z.input<typeof createInteractionSchema>;
