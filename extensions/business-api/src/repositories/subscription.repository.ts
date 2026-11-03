import { query } from '../config/database';
import type {
  SubscriptionPlan,
  OrganizationSubscription,
  SubscriptionStatus,
  BillingInterval,
  SubscriptionPlanDbRow,
  SubscriptionJoinDbRow,
} from '../domain/subscription.types';

export async function listActivePlans(): Promise<SubscriptionPlan[]> {
  const sql = `
    SELECT 
      id,
      name,
      description,
      price_cents AS "priceCents",
      currency,
      included_voice_minutes AS "includedVoiceMinutes",
      additional_minute_rate_cents AS "additionalMinuteRateCents",
      max_concurrent_calls AS "maxConcurrentCalls",
      max_voice_agents AS "maxVoiceAgents",
      supports_byok AS "supportsByok",
      features,
      is_active AS "isActive",
      created_at AS "createdAt"
    FROM business_ext.subscription_plans
    WHERE is_active = true
    ORDER BY price_cents ASC
  `;
  const res = await query<SubscriptionPlanDbRow>(sql);
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    priceCents: Number(r.priceCents),
    currency: r.currency,
    includedVoiceMinutes: Number(r.includedVoiceMinutes),
    additionalMinuteRateCents: Number(r.additionalMinuteRateCents),
    maxConcurrentCalls: Number(r.maxConcurrentCalls),
    maxVoiceAgents: Number(r.maxVoiceAgents),
    supportsByok: Boolean(r.supportsByok),
    features: r.features || [],
    isActive: Boolean(r.isActive),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
  }));
}

export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  const sql = `
    SELECT 
      id,
      name,
      description,
      price_cents AS "priceCents",
      currency,
      included_voice_minutes AS "includedVoiceMinutes",
      additional_minute_rate_cents AS "additionalMinuteRateCents",
      max_concurrent_calls AS "maxConcurrentCalls",
      max_voice_agents AS "maxVoiceAgents",
      supports_byok AS "supportsByok",
      features,
      is_active AS "isActive",
      created_at AS "createdAt"
    FROM business_ext.subscription_plans
    WHERE id = $1
  `;
  const res = await query<SubscriptionPlanDbRow>(sql, [planId]);
  const r = res.rows[0];
  if (!r) return null;

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    priceCents: Number(r.priceCents),
    currency: r.currency,
    includedVoiceMinutes: Number(r.includedVoiceMinutes),
    additionalMinuteRateCents: Number(r.additionalMinuteRateCents),
    maxConcurrentCalls: Number(r.maxConcurrentCalls),
    maxVoiceAgents: Number(r.maxVoiceAgents),
    supportsByok: Boolean(r.supportsByok),
    features: r.features || [],
    isActive: Boolean(r.isActive),
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
  };
}

export async function getSubscriptionWithPlan(tenantId: string): Promise<{
  subscription: OrganizationSubscription;
  plan: SubscriptionPlan;
} | null> {
  const sql = `
    SELECT 
      s.id,
      s.tenant_id AS "tenantId",
      s.plan_id AS "planId",
      s.status,
      s.billing_interval AS "billingInterval",
      s.current_period_start AS "currentPeriodStart",
      s.current_period_end AS "currentPeriodEnd",
      s.included_minutes AS "includedMinutes",
      s.bonus_minutes AS "bonusMinutes",
      s.concurrency_limit AS "concurrencyLimit",
      s.custom_rate_cents AS "customRateCents",
      s.stripe_subscription_id AS "stripeSubscriptionId",
      s.stripe_customer_id AS "stripeCustomerId",
      s.notes,
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      p.name AS "planName",
      p.description AS "planDescription",
      p.price_cents AS "priceCents",
      p.currency,
      p.included_voice_minutes AS "planIncludedMinutes",
      p.additional_minute_rate_cents AS "additionalMinuteRateCents",
      p.max_concurrent_calls AS "maxConcurrentCalls",
      p.max_voice_agents AS "maxVoiceAgents",
      p.supports_byok AS "supportsByok",
      p.features AS "planFeatures"
    FROM business_ext.organization_subscriptions s
    INNER JOIN business_ext.subscription_plans p ON p.id = s.plan_id
    WHERE s.tenant_id = $1
  `;
  const res = await query<SubscriptionJoinDbRow>(sql, [tenantId]);
  const r = res.rows[0];
  if (!r) return null;

  const subscription: OrganizationSubscription = {
    id: r.id,
    tenantId: r.tenantId,
    planId: r.planId,
    status: r.status as SubscriptionStatus,
    billingInterval: r.billingInterval as BillingInterval,
    currentPeriodStart: new Date(r.currentPeriodStart).toISOString(),
    currentPeriodEnd: new Date(r.currentPeriodEnd).toISOString(),
    includedMinutes: Number(r.includedMinutes),
    bonusMinutes: Number(r.bonusMinutes),
    concurrencyLimit: Number(r.concurrencyLimit),
    customRateCents: r.customRateCents ? Number(r.customRateCents) : null,
    stripeSubscriptionId: r.stripeSubscriptionId,
    stripeCustomerId: r.stripeCustomerId,
    notes: r.notes || '',
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };

  const plan: SubscriptionPlan = {
    id: r.planId,
    name: r.planName,
    description: r.planDescription,
    priceCents: Number(r.priceCents),
    currency: r.currency,
    includedVoiceMinutes: Number(r.planIncludedMinutes),
    additionalMinuteRateCents: Number(r.additionalMinuteRateCents),
    maxConcurrentCalls: Number(r.maxConcurrentCalls),
    maxVoiceAgents: Number(r.maxVoiceAgents),
    supportsByok: Boolean(r.supportsByok),
    features: r.planFeatures || [],
    isActive: true,
  };

  return { subscription, plan };
}

export async function ensureDefaultSubscription(
  tenantId: string,
  defaultPlanId = 'starter'
): Promise<{ subscription: OrganizationSubscription; plan: SubscriptionPlan }> {
  const existing = await getSubscriptionWithPlan(tenantId);
  if (existing) return existing;

  const plan = await getPlanById(defaultPlanId);
  if (!plan) throw new Error(`Default plan '${defaultPlanId}' not found`);

  const sql = `
    INSERT INTO business_ext.organization_subscriptions
    (tenant_id, plan_id, status, billing_interval, current_period_start, current_period_end, included_minutes, concurrency_limit)
    VALUES ($1, $2, 'active', 'month', NOW(), NOW() + INTERVAL '1 month', $3, $4)
    ON CONFLICT (tenant_id) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `;
  await query(sql, [tenantId, plan.id, plan.includedVoiceMinutes, plan.maxConcurrentCalls]);

  const loaded = await getSubscriptionWithPlan(tenantId);
  if (!loaded) throw new Error('Failed to create or retrieve default subscription');
  return loaded;
}

export async function calculatePeriodMinutesUsed(
  acuityOrgId: number,
  periodStart: Date,
  periodEnd: Date
): Promise<{ totalMinutes: number; totalCalls: number }> {
  const sql = `
    SELECT 
      COUNT(wr.id)::int AS total_calls,
      COALESCE(SUM((wr.usage_info->>'call_duration_seconds')::numeric) / 60.0, 0)::float AS total_minutes
    FROM public.workflows w
    INNER JOIN public.workflow_runs wr ON wr.workflow_id = w.id
    WHERE w.organization_id = $1
      AND wr.created_at >= $2
      AND wr.created_at <= $3
  `;
  const res = await query<{ total_calls?: number; total_minutes?: number }>(sql, [
    acuityOrgId,
    periodStart,
    periodEnd,
  ]);
  const row = res.rows[0];
  return {
    totalCalls: Number(row?.total_calls || 0),
    totalMinutes: Math.round(Number(row?.total_minutes || 0) * 10) / 10,
  };
}

export async function getActiveAgentsCount(acuityOrgId: number): Promise<number> {
  const sql = `
    SELECT COUNT(*)::int AS active_count
    FROM public.workflows
    WHERE organization_id = $1
  `;
  const res = await query<{ active_count?: number }>(sql, [acuityOrgId]);
  return Number(res.rows[0]?.active_count || 0);
}

export async function updateSubscription(
  tenantId: string,
  updates: {
    planId?: string;
    status?: SubscriptionStatus;
    includedMinutes?: number;
    bonusMinutesDelta?: number;
    concurrencyLimit?: number;
    notes?: string;
  }
): Promise<OrganizationSubscription> {
  const current = await getSubscriptionWithPlan(tenantId);
  if (!current) throw new Error('Subscription not found for tenant');

  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [tenantId];
  let paramIndex = 2;

  if (updates.planId !== undefined) {
    sets.push(`plan_id = $${paramIndex++}`);
    values.push(updates.planId);
  }
  if (updates.status !== undefined) {
    sets.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.includedMinutes !== undefined) {
    sets.push(`included_minutes = $${paramIndex++}`);
    values.push(updates.includedMinutes);
  }
  if (updates.bonusMinutesDelta !== undefined) {
    sets.push(`bonus_minutes = GREATEST(0, bonus_minutes + $${paramIndex++})`);
    values.push(updates.bonusMinutesDelta);
  }
  if (updates.concurrencyLimit !== undefined) {
    sets.push(`concurrency_limit = $${paramIndex++}`);
    values.push(updates.concurrencyLimit);
  }
  if (updates.notes !== undefined) {
    sets.push(`notes = $${paramIndex++}`);
    values.push(updates.notes);
  }

  const sql = `
    UPDATE business_ext.organization_subscriptions
    SET ${sets.join(', ')}
    WHERE tenant_id = $1
    RETURNING *
  `;
  await query(sql, values);

  const reloaded = await getSubscriptionWithPlan(tenantId);
  if (!reloaded) throw new Error('Failed to reload updated subscription');
  return reloaded.subscription;
}

export {
  insertAccountControlLog,
  listAllClientAccounts,
} from './admin-accounts.repository';

