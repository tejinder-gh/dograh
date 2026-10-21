import { query } from '../config/database';

export interface PlatformExecutiveSummary {
  totalClients: number;
  activeClients: number;
  newClients: number;
  totalPlatformCalls: number;
  answeredCalls: number;
  failedCalls: number;
  totalMinutes: number;
  totalAiCostUsd: number;
  recognizedRevenueUsd: number | null;
}

export async function fetchPlatformExecutiveSummary(
  from: Date,
  to: Date
): Promise<PlatformExecutiveSummary> {
  // Query organization portfolio counts: distinguish total, registered in period, and traffic-active orgs
  const orgsSql = `
    WITH active_orgs AS (
      SELECT DISTINCT w.organization_id
      FROM public.workflows w
      INNER JOIN public.workflow_runs wr ON wr.workflow_id = w.id
      WHERE wr.created_at >= $1 AND wr.created_at <= $2
    )
    SELECT
      COUNT(o.id)::int AS total_clients,
      COUNT(o.id) FILTER (WHERE o.created_at >= $1 AND o.created_at <= $2)::int AS new_clients,
      (SELECT COUNT(*)::int FROM active_orgs) AS active_clients
    FROM public.organizations o
  `;
  const orgsRes = await query(orgsSql, [from, to]);
  const orgRow = orgsRes.rows[0] || {};

  // Query platform call runs
  const runsSql = `
    SELECT
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE state = 'completed' OR COALESCE((usage_info->>'call_duration_seconds')::numeric, 0) > 0)::int AS answered_calls,
      COUNT(*) FILTER (WHERE is_completed = false AND (state = 'completed' OR extra->>'telephony_status' IN ('failed', 'error')))::int AS failed_calls,
      COALESCE(SUM((usage_info->>'call_duration_seconds')::numeric) / 60.0, 0)::float AS total_minutes,
      COALESCE(SUM(COALESCE((cost_info->>'total_cost_usd')::numeric, (cost_info->>'charge_usd')::numeric, 0)), 0)::float AS total_ai_cost_usd
    FROM public.workflow_runs
    WHERE created_at >= $1 AND created_at <= $2
  `;
  const runsRes = await query(runsSql, [from, to]);
  const runRow = runsRes.rows[0] || {};

  // Invoiced recognized revenue: Reconciled billing ledger and provider attribution
  // are uninstrumented; return null so UI and service report 'Unavailable' honestly.
  const recognizedRevenueUsd: number | null = null;

  return {
    totalClients: Number(orgRow.total_clients || 0),
    activeClients: Number(orgRow.active_clients || 0),
    newClients: Number(orgRow.new_clients || 0),
    totalPlatformCalls: Number(runRow.total_calls || 0),
    answeredCalls: Number(runRow.answered_calls || 0),
    failedCalls: Number(runRow.failed_calls || 0),
    totalMinutes: Number(runRow.total_minutes || 0),
    totalAiCostUsd: Number(runRow.total_ai_cost_usd || 0),
    recognizedRevenueUsd,
  };
}

export async function fetchPlatformClientPortfolio(
  from: Date,
  to: Date
) {
  // Pre-aggregate workflow and run stats to avoid cartesian row multiplication across multiple profiles
  const sql = `
    WITH run_stats AS (
      SELECT
        w.organization_id,
        COUNT(DISTINCT w.id)::int AS active_agents_count,
        COUNT(wr.id)::int AS total_calls,
        COALESCE(SUM((wr.usage_info->>'call_duration_seconds')::numeric) / 60.0, 0)::float AS total_minutes,
        COALESCE(SUM(COALESCE((wr.cost_info->>'total_cost_usd')::numeric, 0)), 0)::float AS total_cost_usd
      FROM public.workflows w
      LEFT JOIN public.workflow_runs wr ON wr.workflow_id = w.id
        AND wr.created_at >= $1
        AND wr.created_at <= $2
      GROUP BY w.organization_id
    ),
    tenant_mappings AS (
      SELECT
        om.acuity_organization_id,
        om.business_tenant_id,
        bp.name AS profile_name,
        ROW_NUMBER() OVER (PARTITION BY om.acuity_organization_id ORDER BY bp.created_at ASC) as rn
      FROM business_ext.organization_mappings om
      LEFT JOIN business_ext.business_profiles bp ON bp.tenant_id = om.business_tenant_id
    )
    SELECT
      o.id AS organization_id,
      COALESCE(tm.profile_name, o.provider_id, 'Client #' || o.id::text) AS organization_name,
      COALESCE(tm.business_tenant_id::text, '') AS tenant_id,
      o.created_at,
      COALESCE(rs.active_agents_count, 0)::int AS active_agents_count,
      COALESCE(rs.total_calls, 0)::int AS total_calls,
      COALESCE(rs.total_minutes, 0)::float AS total_minutes,
      COALESCE(rs.total_cost_usd, 0)::float AS total_cost_usd
    FROM public.organizations o
    LEFT JOIN tenant_mappings tm ON tm.acuity_organization_id = o.id AND tm.rn = 1
    LEFT JOIN run_stats rs ON rs.organization_id = o.id
    ORDER BY total_calls DESC, o.id ASC
  `;
  const res = await query(sql, [from, to]);
  return res.rows.map((r) => ({
    organizationId: Number(r.organization_id),
    organizationName: String(r.organization_name || `Organization #${r.organization_id}`),
    tenantId: String(r.tenant_id),
    createdAt: new Date(r.created_at).toISOString(),
    activeAgentsCount: Number(r.active_agents_count || 0),
    totalCalls: Number(r.total_calls || 0),
    totalMinutes: Math.round(Number(r.total_minutes || 0) * 10) / 10,
    totalCostUsd: Math.round(Number(r.total_cost_usd || 0) * 100) / 100,
    recognizedRevenueUsd: null as number | null,
    status: (Number(r.total_calls) > 0 ? 'active' : 'trial') as 'active' | 'trial' | 'churned' | 'suspended',
  }));
}

export async function fetchPlatformUsageTrend(
  from: Date,
  to: Date
) {
  const sql = `
    SELECT
      DATE_TRUNC('day', created_at) AS day_ts,
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE state = 'completed' OR COALESCE((usage_info->>'call_duration_seconds')::numeric, 0) > 0)::int AS answered_calls,
      COUNT(*) FILTER (WHERE is_completed = false AND (state = 'completed' OR extra->>'telephony_status' IN ('failed', 'error')))::int AS failed_calls,
      COALESCE(SUM(COALESCE((cost_info->>'total_cost_usd')::numeric, 0)), 0)::float AS ai_cost_usd,
      COALESCE(SUM((usage_info->>'call_duration_seconds')::numeric), 0)::float AS talk_time_seconds
    FROM public.workflow_runs
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY day_ts ASC
  `;
  const res = await query(sql, [from, to]);
  return res.rows.map((r) => ({
    timestamp: new Date(r.day_ts).toISOString().split('T')[0] ?? '',
    totalCalls: Number(r.total_calls || 0),
    answeredCalls: Number(r.answered_calls || 0),
    failedCalls: Number(r.failed_calls || 0),
    aiCostUsd: Number(r.ai_cost_usd || 0),
    talkTimeSeconds: Number(r.talk_time_seconds || 0),
  }));
}

export async function fetchPlatformProviderBreakdown(
  from: Date,
  to: Date
) {
  // Synthesizes provider breakdown from workflow configurations and runs
  const sql = `
    SELECT
      COALESCE(wr.model_configuration_snapshot->>'provider', 'OpenAI') AS provider,
      COALESCE(wr.model_configuration_snapshot->>'model', 'gpt-4o-mini') AS model,
      COUNT(*)::int AS call_count,
      COALESCE(SUM(COALESCE((wr.cost_info->>'total_cost_usd')::numeric, 0)), 0)::float AS cost_usd
    FROM public.workflow_runs wr
    WHERE wr.created_at >= $1 AND wr.created_at <= $2
    GROUP BY provider, model
    ORDER BY call_count DESC
  `;
  const res = await query(sql, [from, to]);
  return res.rows.map((r) => ({
    provider: String(r.provider),
    model: String(r.model),
    callCount: Number(r.call_count),
    costUsd: Math.round(Number(r.cost_usd) * 100) / 100,
  }));
}
