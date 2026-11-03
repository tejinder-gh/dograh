import { z } from 'zod';

export const SubscriptionPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().default('usd'),
  includedVoiceMinutes: z.number().int().nonnegative(),
  additionalMinuteRateCents: z.number().int().nonnegative(),
  maxConcurrentCalls: z.number().int().positive().default(2),
  maxVoiceAgents: z.number().int().positive().default(3),
  supportsByok: z.boolean().default(false),
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
});

export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

export const SubscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'paused',
]);

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const BillingIntervalSchema = z.enum(['month', 'year', 'custom']);
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;

export const OrganizationSubscriptionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  planId: z.string(),
  status: SubscriptionStatusSchema,
  billingInterval: BillingIntervalSchema,
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  includedMinutes: z.number().int().nonnegative(),
  bonusMinutes: z.number().int().nonnegative().default(0),
  concurrencyLimit: z.number().int().positive().default(2),
  customRateCents: z.number().int().nonnegative().nullable().optional(),
  stripeSubscriptionId: z.string().nullable().optional(),
  stripeCustomerId: z.string().nullable().optional(),
  notes: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OrganizationSubscription = z.infer<typeof OrganizationSubscriptionSchema>;

export interface ClientSubscriptionOverview {
  tenantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  includedMinutes: number;
  bonusMinutes: number;
  totalAllocatedMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  usagePercentage: number;
  concurrencyLimit: number;
  activeAgentsCount: number;
  availablePlans: SubscriptionPlan[];
}

export const AdminUpdateSubscriptionSchema = z.object({
  planId: z.string().optional(),
  status: SubscriptionStatusSchema.optional(),
  bonusMinutesDelta: z.number().int().optional(),
  concurrencyLimit: z.number().int().positive().optional(),
  notes: z.string().optional(),
  reason: z.string().min(1, 'Audit reason is required for administrative changes'),
});

export type AdminUpdateSubscriptionRequest = z.infer<typeof AdminUpdateSubscriptionSchema>;

export interface AdminClientAccountRow {
  organizationId: number;
  tenantId: string;
  organizationName: string;
  ownerEmail: string | null;
  planId: string;
  planName: string;
  priceMonthlyUsd: number;
  status: SubscriptionStatus;
  concurrencyLimit: number;
  activeAgentsCount: number;
  totalCalls: number;
  totalMinutesUsed: number;
  totalAllocatedMinutes: number;
  remainingMinutes: number;
  directAiCostUsd: number;
  grossProfitUsd: number;
  createdAt: string;
}

export interface SubscriptionPlanDbRow {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  includedVoiceMinutes: number;
  additionalMinuteRateCents: number;
  maxConcurrentCalls: number;
  maxVoiceAgents: number;
  supportsByok: boolean;
  features: string[];
  isActive: boolean;
  createdAt?: string | Date;
}

export interface SubscriptionJoinDbRow {
  id: string;
  tenantId: string;
  planId: string;
  status: string;
  billingInterval: string;
  currentPeriodStart: string | Date;
  currentPeriodEnd: string | Date;
  includedMinutes: number;
  bonusMinutes: number;
  concurrencyLimit: number;
  customRateCents?: number | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  notes?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  planName: string;
  planDescription: string;
  priceCents: number;
  currency: string;
  planIncludedMinutes: number;
  additionalMinuteRateCents: number;
  maxConcurrentCalls: number;
  maxVoiceAgents: number;
  supportsByok: boolean;
  planFeatures: string[];
}

