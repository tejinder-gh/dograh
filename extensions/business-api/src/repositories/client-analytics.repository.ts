import { query } from '../config/database';

export interface RawCallSummary {
  totalCalls: number;
  answeredCalls: number;
  failedCalls: number;
  missedCalls: number;
  totalDurationSeconds: number;
  totalCostUsd: number;
}

export interface RawLeadSummary {
  totalLeads: number;
  qualifiedLeads: number;
  avgLeadScore: number | null;
}

export interface RawAppointmentSummary {
  totalAppointments: number;
  confirmedAppointments: number;
  totalDealValue: number;
}

export interface RawExperienceSummary {
  totalInteractions: number;
  avgSentimentScore: number | null;
  positiveCount: number;
  escalatedCount: number;
}

export async function fetchClientCallSummary(
  acuityOrgId: number,
  from: Date,
  to: Date,
  workflowId?: number
): Promise<RawCallSummary> {
  const params: unknown[] = [acuityOrgId, from, to];
  let wfFilter = '';
  if (workflowId) {
    params.push(workflowId);
    wfFilter = ` AND wr.workflow_id = $${params.length}`;
  }

  const sql = `
    SELECT
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE wr.state = 'completed' OR COALESCE((wr.usage_info->>'call_duration_seconds')::numeric, 0) > 0)::int AS answered_calls,
      COUNT(*) FILTER (WHERE wr.is_completed = false AND (wr.state = 'completed' OR wr.extra->>'telephony_status' IN ('failed', 'error')))::int AS failed_calls,
      COUNT(*) FILTER (WHERE wr.call_type = 'inbound' AND wr.state = 'initialized')::int AS missed_calls,
      COALESCE(SUM((wr.usage_info->>'call_duration_seconds')::numeric), 0)::float AS total_duration_seconds,
      COALESCE(SUM(COALESCE((wr.cost_info->>'total_cost_usd')::numeric, (wr.cost_info->>'charge_usd')::numeric, 0)), 0)::float AS total_cost_usd
    FROM public.workflow_runs wr
    INNER JOIN public.workflows w ON wr.workflow_id = w.id
    WHERE w.organization_id = $1
      AND wr.created_at >= $2
      AND wr.created_at <= $3
      ${wfFilter}
  `;

  const res = await query(sql, params);
  const row = res.rows[0] || {};
  return {
    totalCalls: Number(row.total_calls || 0),
    answeredCalls: Number(row.answered_calls || 0),
    failedCalls: Number(row.failed_calls || 0),
    missedCalls: Number(row.missed_calls || 0),
    totalDurationSeconds: Number(row.total_duration_seconds || 0),
    totalCostUsd: Number(row.total_cost_usd || 0),
  };
}

export async function fetchClientLeadSummary(
  tenantId: string,
  from: Date,
  to: Date
): Promise<RawLeadSummary> {
  const sql = `
    SELECT
      COUNT(*)::int AS total_leads,
      COUNT(*) FILTER (WHERE lifecycle_status = 'qualified')::int AS qualified_leads,
      AVG(lead_score)::float AS avg_lead_score
    FROM business_ext.contacts
    WHERE tenant_id = $1
      AND created_at >= $2
      AND created_at <= $3
  `;
  const res = await query(sql, [tenantId, from, to]);
  const row = res.rows[0] || {};
  return {
    totalLeads: Number(row.total_leads || 0),
    qualifiedLeads: Number(row.qualified_leads || 0),
    avgLeadScore: row.avg_lead_score !== null && row.avg_lead_score !== undefined ? Number(row.avg_lead_score) : null,
  };
}

export async function fetchClientAppointmentSummary(
  tenantId: string,
  from: Date,
  to: Date,
  workflowId?: number
): Promise<RawAppointmentSummary> {
  const params: unknown[] = [tenantId, from, to];
  let wfFilter = '';
  if (workflowId) {
    params.push(workflowId);
    wfFilter = ` AND acuity_workflow_id = $${params.length}`;
  }

  const sql = `
    SELECT
      COUNT(*)::int AS total_appointments,
      COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed'))::int AS confirmed_appointments,
      COALESCE(SUM(resulting_deal_value), 0)::float AS total_deal_value
    FROM business_ext.appointments
    WHERE tenant_id = $1
      AND (created_at >= $2 AND created_at <= $3 OR (start_time >= $2 AND start_time <= $3))
      ${wfFilter}
  `;
  const res = await query(sql, params);
  const row = res.rows[0] || {};
  return {
    totalAppointments: Number(row.total_appointments || 0),
    confirmedAppointments: Number(row.confirmed_appointments || 0),
    totalDealValue: Number(row.total_deal_value || 0),
  };
}

export async function fetchClientExperienceSummary(
  tenantId: string,
  from: Date,
  to: Date
): Promise<RawExperienceSummary> {
  const sql = `
    SELECT
      COUNT(*)::int AS total_interactions,
      AVG(sentiment_score)::float AS avg_sentiment_score,
      COUNT(*) FILTER (WHERE sentiment_category = 'positive')::int AS positive_count,
      COUNT(*) FILTER (WHERE was_escalated = true)::int AS escalated_count
    FROM business_ext.interactions
    WHERE tenant_id = $1
      AND created_at >= $2
      AND created_at <= $3
  `;
  const res = await query(sql, [tenantId, from, to]);
  const row = res.rows[0] || {};
  return {
    totalInteractions: Number(row.total_interactions || 0),
    avgSentimentScore: row.avg_sentiment_score !== null && row.avg_sentiment_score !== undefined ? Number(row.avg_sentiment_score) : null,
    positiveCount: Number(row.positive_count || 0),
    escalatedCount: Number(row.escalated_count || 0),
  };
}

export async function fetchClientCallTimeSeries(
  acuityOrgId: number,
  from: Date,
  to: Date,
  workflowId?: number
) {
  const params: unknown[] = [acuityOrgId, from, to];
  let wfFilter = '';
  if (workflowId) {
    params.push(workflowId);
    wfFilter = ` AND wr.workflow_id = $${params.length}`;
  }

  const sql = `
    SELECT
      DATE_TRUNC('day', wr.created_at) AS day_ts,
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE wr.state = 'completed' OR COALESCE((wr.usage_info->>'call_duration_seconds')::numeric, 0) > 0)::int AS answered_calls,
      COUNT(*) FILTER (WHERE wr.is_completed = false AND (wr.state = 'completed' OR wr.extra->>'telephony_status' IN ('failed', 'error')))::int AS failed_calls,
      COALESCE(SUM(COALESCE((wr.cost_info->>'total_cost_usd')::numeric, 0)), 0)::float AS ai_cost_usd,
      COALESCE(SUM((wr.usage_info->>'call_duration_seconds')::numeric), 0)::float AS talk_time_seconds
    FROM public.workflow_runs wr
    INNER JOIN public.workflows w ON wr.workflow_id = w.id
    WHERE w.organization_id = $1
      AND wr.created_at >= $2
      AND wr.created_at <= $3
      ${wfFilter}
    GROUP BY DATE_TRUNC('day', wr.created_at)
    ORDER BY day_ts ASC
  `;
  const res = await query(sql, params);
  return res.rows.map((r) => ({
    timestamp: new Date(r.day_ts).toISOString().split('T')[0] ?? '',
    totalCalls: Number(r.total_calls || 0),
    answeredCalls: Number(r.answered_calls || 0),
    failedCalls: Number(r.failed_calls || 0),
    aiCostUsd: Number(r.ai_cost_usd || 0),
    talkTimeSeconds: Number(r.talk_time_seconds || 0),
  }));
}

export async function fetchClientHourlyHeatmap(
  acuityOrgId: number,
  from: Date,
  to: Date,
  workflowId?: number
) {
  const params: unknown[] = [acuityOrgId, from, to];
  let wfFilter = '';
  if (workflowId) {
    params.push(workflowId);
    wfFilter = ` AND wr.workflow_id = $${params.length}`;
  }

  const sql = `
    SELECT
      EXTRACT(DOW FROM wr.created_at)::int AS day_of_week,
      EXTRACT(HOUR FROM wr.created_at)::int AS hour_of_day,
      COUNT(*)::int AS call_count
    FROM public.workflow_runs wr
    INNER JOIN public.workflows w ON wr.workflow_id = w.id
    WHERE w.organization_id = $1
      AND wr.created_at >= $2
      AND wr.created_at <= $3
      ${wfFilter}
    GROUP BY EXTRACT(DOW FROM wr.created_at), EXTRACT(HOUR FROM wr.created_at)
    ORDER BY day_of_week, hour_of_day
  `;
  const res = await query(sql, params);
  return res.rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    hour: Number(r.hour_of_day),
    callCount: Number(r.call_count),
  }));
}

export async function fetchClientAgentRankings(
  acuityOrgId: number,
  from: Date,
  to: Date
) {
  const sql = `
    SELECT
      w.id AS agent_id,
      w.name AS agent_name,
      COUNT(wr.id)::int AS total_calls,
      COUNT(wr.id) FILTER (WHERE wr.state = 'completed' OR COALESCE((wr.usage_info->>'call_duration_seconds')::numeric, 0) > 0)::int AS answered_calls,
      AVG(COALESCE((wr.usage_info->>'call_duration_seconds')::numeric, 0))::float AS avg_duration_seconds,
      COALESCE(SUM(COALESCE((wr.cost_info->>'total_cost_usd')::numeric, 0)), 0)::float AS total_cost_usd
    FROM public.workflows w
    LEFT JOIN public.workflow_runs wr ON wr.workflow_id = w.id
      AND wr.created_at >= $2
      AND wr.created_at <= $3
    WHERE w.organization_id = $1
    GROUP BY w.id, w.name
    ORDER BY total_calls DESC
  `;
  const res = await query(sql, [acuityOrgId, from, to]);
  return res.rows.map((r) => ({
    agentId: Number(r.agent_id),
    agentName: String(r.agent_name || `Agent #${r.agent_id}`),
    totalCalls: Number(r.total_calls || 0),
    answeredCalls: Number(r.answered_calls || 0),
    avgDurationSeconds: r.avg_duration_seconds !== null ? Number(r.avg_duration_seconds) : null,
    totalCostUsd: Number(r.total_cost_usd || 0),
  }));
}
