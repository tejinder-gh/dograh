export interface SubscriptionPlan {
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
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';
export type BillingInterval = 'month' | 'year' | 'custom';

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
