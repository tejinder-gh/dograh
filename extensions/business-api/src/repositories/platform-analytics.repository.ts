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
  // Query organization portfolio counts
  const orgsSql = `
    SELECT
      COUNT(*)::int AS total_clients,
      COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2)::int AS new_clients,
      COUNT(DISTINCT w.organization_id)::int AS active_clients
    FROM public.organizations o
    LEFT JOIN public.workflows w ON w.organization_id = o.id
  `;
  const orgsRes = await query(orgsSql, [from, to]);
  const orgRow = orgsRes.rows[0] || {};

  // Query platform call runs
  const runsSql = `
    SELECT
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE state = 'completed' OR COALESCE((usage_info->>'call_duration_seconds')::numeric, 0) > 0)::int AS answered_calls,
      COUNT(*) FILTER (WHERE state IN ('failed', 'timed_out'))::int AS failed_calls,
      COALESCE(SUM((usage_info->>'call_duration_seconds')::numeric) / 60.0, 0)::float AS total_minutes,
      COALESCE(SUM(COALESCE((cost_info->>'total_cost_usd')::numeric, (cost_info->>'charge_usd')::numeric, 0)), 0)::float AS total_ai_cost_usd
    FROM public.workflow_runs
    WHERE created_at >= $1 AND created_at <= $2
  `;
  const runsRes = await query(runsSql, [from, to]);
  const runRow = runsRes.rows[0] || {};

  // Query recognized revenue from usage cycles if available
  let recognizedRevenueUsd: number | null = null;
  try {
    const revSql = `
      SELECT COALESCE(SUM(amount_cents) / 100.0, 0)::float AS rev
      FROM public.organization_usage_cycles
      WHERE created_at >= $1 AND created_at <= $2
    `;
    const revRes = await query(revSql, [from, to]);
    const firstRow = revRes.rows[0];
    if (firstRow && firstRow.rev !== null && firstRow.rev !== undefined) {
      recognizedRevenueUsd = Number(firstRow.rev);
    }
  } catch {
    // If billing tables are not active, leave as null ("Unavailable")
    recognizedRevenueUsd = null;
  }

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
  const sql = `
    SELECT
      o.id AS organization_id,
      o.name AS organization_name,
      COALESCE(om.id::text, '') AS tenant_id,
      o.created_at,
      COUNT(DISTINCT w.id)::int AS active_agents_count,
      COUNT(wr.id)::int AS total_calls,
      COALESCE(SUM((wr.usage_info->>'call_duration_seconds')::numeric) / 60.0, 0)::float AS total_minutes,
      COALESCE(SUM(COALESCE((wr.cost_info->>'total_cost_usd')::numeric, 0)), 0)::float AS total_cost_usd
    FROM public.organizations o
    LEFT JOIN business_ext.organization_mappings om ON om.acuity_organization_id = o.id
    LEFT JOIN public.workflows w ON w.organization_id = o.id
    LEFT JOIN public.workflow_runs wr ON wr.workflow_id = w.id
      AND wr.created_at >= $1
      AND wr.created_at <= $2
    GROUP BY o.id, o.name, om.id, o.created_at
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
      COUNT(*) FILTER (WHERE state IN ('failed', 'timed_out'))::int AS failed_calls,
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
