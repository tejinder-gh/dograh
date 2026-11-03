import { query } from '../config/database';
import type { AdminClientAccountRow, SubscriptionStatus } from '../domain/subscription.types';

export async function insertAccountControlLog(
  tenantId: string,
  adminUserId: string,
  action: string,
  previousState: unknown,
  newState: unknown,
  reason: string
): Promise<void> {
  const sql = `
    INSERT INTO business_ext.account_control_logs
    (tenant_id, admin_user_id, action, previous_state, new_state, reason)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
  `;
  await query(sql, [
    tenantId,
    adminUserId,
    action,
    JSON.stringify(previousState || {}),
    JSON.stringify(newState || {}),
    reason,
  ]);
}

export async function listAllClientAccounts(): Promise<AdminClientAccountRow[]> {
  const sql = `
    WITH org_users AS (
      SELECT 
        o.id AS organization_id,
        MIN(u.email) as primary_email
      FROM public.organizations o
      LEFT JOIN public.users u ON u.selected_organization_id = o.id
      GROUP BY o.id
    ),
    run_aggregates AS (
      SELECT 
        w.organization_id,
        COUNT(DISTINCT w.id)::int AS active_agents,
        COUNT(wr.id)::int AS total_calls,
        COALESCE(SUM((wr.usage_info->>'call_duration_seconds')::numeric) / 60.0, 0)::float AS total_minutes,
        COALESCE(SUM(COALESCE((wr.cost_info->>'total_cost_usd')::numeric, 0)), 0)::float AS total_ai_cost
      FROM public.workflows w
      LEFT JOIN public.workflow_runs wr ON wr.workflow_id = w.id
      GROUP BY w.organization_id
    )
    SELECT 
      o.id AS organization_id,
      om.business_tenant_id AS tenant_id,
      COALESCE(bp.name, o.provider_id, 'Client #' || o.id::text) AS organization_name,
      ou.primary_email AS owner_email,
      COALESCE(s.plan_id, 'starter') AS plan_id,
      COALESCE(p.name, 'Starter Plan') AS plan_name,
      COALESCE(p.price_cents / 100.0, 99.0)::float AS price_monthly_usd,
      COALESCE(s.status, 'active') AS status,
      COALESCE(s.concurrency_limit, 2)::int AS concurrency_limit,
      COALESCE(ra.active_agents, 0)::int AS active_agents_count,
      COALESCE(ra.total_calls, 0)::int AS total_calls,
      ROUND(COALESCE(ra.total_minutes, 0)::numeric, 1)::float AS total_minutes_used,
      COALESCE(s.included_minutes + s.bonus_minutes, 250)::int AS total_allocated_minutes,
      GREATEST(0, (COALESCE(s.included_minutes + s.bonus_minutes, 250) - COALESCE(ra.total_minutes, 0)))::int AS remaining_minutes,
      ROUND(COALESCE(ra.total_ai_cost, 0)::numeric, 2)::float AS direct_ai_cost_usd,
      ROUND((COALESCE(p.price_cents / 100.0, 99.0) - COALESCE(ra.total_ai_cost, 0))::numeric, 2)::float AS gross_profit_usd,
      o.created_at AS created_at
    FROM public.organizations o
    INNER JOIN business_ext.organization_mappings om ON om.acuity_organization_id = o.id
    LEFT JOIN business_ext.business_profiles bp ON bp.tenant_id = om.business_tenant_id
    LEFT JOIN business_ext.organization_subscriptions s ON s.tenant_id = om.business_tenant_id
    LEFT JOIN business_ext.subscription_plans p ON p.id = s.plan_id
    LEFT JOIN org_users ou ON ou.organization_id = o.id
    LEFT JOIN run_aggregates ra ON ra.organization_id = o.id
    ORDER BY o.id ASC
  `;
  const res = await query<{
    organization_id: number;
    tenant_id: string;
    organization_name: string;
    owner_email: string | null;
    plan_id: string;
    plan_name: string;
    price_monthly_usd: number;
    status: string;
    concurrency_limit: number;
    active_agents_count: number;
    total_calls: number;
    total_minutes_used: number;
    total_allocated_minutes: number;
    remaining_minutes: number;
    direct_ai_cost_usd: number;
    gross_profit_usd: number;
    created_at?: string | Date;
  }>(sql);

  return res.rows.map((r) => ({
    organizationId: Number(r.organization_id),
    tenantId: r.tenant_id,
    organizationName: r.organization_name,
    ownerEmail: r.owner_email,
    planId: r.plan_id,
    planName: r.plan_name,
    priceMonthlyUsd: Number(r.price_monthly_usd),
    status: r.status as SubscriptionStatus,
    concurrencyLimit: Number(r.concurrency_limit || 2),
    activeAgentsCount: Number(r.active_agents_count || 0),
    totalCalls: Number(r.total_calls || 0),
    totalMinutesUsed: Number(r.total_minutes_used || 0),
    totalAllocatedMinutes: Number(r.total_allocated_minutes || 250),
    remainingMinutes: Number(r.remaining_minutes || 0),
    directAiCostUsd: Number(r.direct_ai_cost_usd || 0),
    grossProfitUsd: Number(r.gross_profit_usd || 0),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
  }));
}
