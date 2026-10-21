import {
  safePercentage,
  safeDelta,
} from '../domain/metrics.registry';
import type {
  AnalyticsTimeFilter,
  ClientOverviewDashboardData,
  KpiMetric,
} from '../domain/analytics.types';
import {
  fetchClientCallSummary,
  fetchClientLeadSummary,
  fetchClientAppointmentSummary,
  fetchClientExperienceSummary,
  fetchClientCallTimeSeries,
  fetchClientHourlyHeatmap,
  fetchClientAgentRankings,
} from '../repositories/client-analytics.repository';

export function resolveTimeWindows(filter: AnalyticsTimeFilter): {
  currentFrom: Date;
  currentTo: Date;
  prevFrom: Date;
  prevTo: Date;
} {
  const now = new Date();
  const currentTo = filter.to ? new Date(filter.to) : now;
  const currentFrom = filter.from
    ? new Date(filter.from)
    : new Date(currentTo.getTime() - 30 * 24 * 60 * 60 * 1000);

  const durationMs = currentTo.getTime() - currentFrom.getTime();
  const prevTo = new Date(currentFrom.getTime());
  const prevFrom = new Date(prevTo.getTime() - durationMs);

  return { currentFrom, currentTo, prevFrom, prevTo };
}

function buildKpi<T extends number>(
  current: T | null,
  previous: T | null,
  status: 'verified' | 'estimated' | 'unavailable' = 'verified',
  formulaExplanation?: string,
  invertTrend = false
): KpiMetric<T> {
  const delta = safeDelta(current, previous);
  let trend: 'up' | 'down' | 'flat' | 'neutral' = 'neutral';
  if (delta !== null) {
    if (delta > 0.5) trend = invertTrend ? 'down' : 'up';
    else if (delta < -0.5) trend = invertTrend ? 'up' : 'down';
    else trend = 'flat';
  }

  return {
    value: current,
    previousValue: previous,
    deltaPercentage: delta,
    trend,
    status,
    formulaExplanation,
  };
}

export async function getClientOverviewDashboard(
  tenantId: string,
  acuityOrgId: number,
  filter: AnalyticsTimeFilter
): Promise<ClientOverviewDashboardData> {
  const { currentFrom, currentTo, prevFrom, prevTo } = resolveTimeWindows(filter);
  const wfId = filter.workflowId;

  // Run current and previous queries in parallel
  const [
    currCalls,
    prevCalls,
    currLeads,
    prevLeads,
    currAppts,
    prevAppts,
    currExp,
    prevExp,
    timeSeries,
    heatmap,
    agentRankings,
  ] = await Promise.all([
    fetchClientCallSummary(acuityOrgId, currentFrom, currentTo, wfId),
    fetchClientCallSummary(acuityOrgId, prevFrom, prevTo, wfId),
    fetchClientLeadSummary(tenantId, currentFrom, currentTo),
    fetchClientLeadSummary(tenantId, prevFrom, prevTo),
    fetchClientAppointmentSummary(tenantId, currentFrom, currentTo, wfId),
    fetchClientAppointmentSummary(tenantId, prevFrom, prevTo, wfId),
    fetchClientExperienceSummary(tenantId, currentFrom, currentTo),
    fetchClientExperienceSummary(tenantId, prevFrom, prevTo),
    fetchClientCallTimeSeries(acuityOrgId, currentFrom, currentTo, wfId),
    fetchClientHourlyHeatmap(acuityOrgId, currentFrom, currentTo, wfId),
    fetchClientAgentRankings(acuityOrgId, currentFrom, currentTo),
  ]);

  // Derived metrics
  const currAnswerRate = safePercentage(currCalls.answeredCalls, currCalls.totalCalls);
  const prevAnswerRate = safePercentage(prevCalls.answeredCalls, prevCalls.totalCalls);

  const currAvgDur = currCalls.answeredCalls > 0
    ? Math.round(currCalls.totalDurationSeconds / currCalls.answeredCalls)
    : null;
  const prevAvgDur = prevCalls.answeredCalls > 0
    ? Math.round(prevCalls.totalDurationSeconds / prevCalls.answeredCalls)
    : null;

  const currConvRate = safePercentage(currLeads.qualifiedLeads, currLeads.totalLeads);
  const prevConvRate = safePercentage(prevLeads.qualifiedLeads, prevLeads.totalLeads);

  const currApptRate = safePercentage(currAppts.totalAppointments, currCalls.answeredCalls);
  const prevApptRate = safePercentage(prevAppts.totalAppointments, prevCalls.answeredCalls);

  const currEscRate = safePercentage(currExp.escalatedCount, currExp.totalInteractions);
  const prevEscRate = safePercentage(prevExp.escalatedCount, prevExp.totalInteractions);

  // Value calculation: 15 minutes human staff saved per answered call ($25/hr standard wage)
  const currHoursSaved = Math.round((currCalls.answeredCalls * 15) / 60 * 10) / 10;
  const prevHoursSaved = Math.round((prevCalls.answeredCalls * 15) / 60 * 10) / 10;

  const currNetVal = Math.round(currHoursSaved * 25 - currCalls.totalCostUsd);
  const prevNetVal = Math.round(prevHoursSaved * 25 - prevCalls.totalCostUsd);

  // Disposition partition
  const completedCalls = currCalls.answeredCalls;
  const total = currCalls.totalCalls;
  const dispositions = [
    {
      disposition: 'Completed',
      count: completedCalls,
      percentage: safePercentage(completedCalls, total),
    },
    {
      disposition: 'Missed',
      count: currCalls.missedCalls,
      percentage: safePercentage(currCalls.missedCalls, total),
    },
    {
      disposition: 'Failed',
      count: currCalls.failedCalls,
      percentage: safePercentage(currCalls.failedCalls, total),
    },
  ];

  return {
    timeframe: {
      from: currentFrom.toISOString(),
      to: currentTo.toISOString(),
      comparePeriod: {
        from: prevFrom.toISOString(),
        to: prevTo.toISOString(),
      },
    },
    kpis: {
      totalCalls: buildKpi(currCalls.totalCalls, prevCalls.totalCalls, 'verified', 'COUNT(*) total call attempts'),
      answeredCalls: buildKpi(currCalls.answeredCalls, prevCalls.answeredCalls, 'verified', 'COUNT(*) connected conversation stream'),
      answerRate: buildKpi(currAnswerRate, prevAnswerRate, 'verified', 'answeredCalls / totalCalls * 100'),
      avgDurationSeconds: buildKpi(currAvgDur, prevAvgDur, 'verified', 'totalDuration / answeredCalls'),
      totalLeads: buildKpi(currLeads.totalLeads, prevLeads.totalLeads, 'verified', 'COUNT(*) contacts captured in CRM'),
      qualifiedLeads: buildKpi(currLeads.qualifiedLeads, prevLeads.qualifiedLeads, 'verified', "COUNT(*) contacts where status = 'qualified'"),
      leadConversionRate: buildKpi(currConvRate, prevConvRate, 'verified', 'qualifiedLeads / totalLeads * 100'),
      totalAppointments: buildKpi(currAppts.totalAppointments, prevAppts.totalAppointments, 'verified', 'COUNT(*) appointments scheduled'),
      confirmedAppointments: buildKpi(currAppts.confirmedAppointments, prevAppts.confirmedAppointments, 'verified', "COUNT(*) appointments where status = 'confirmed'"),
      appointmentRate: buildKpi(currApptRate, prevApptRate, 'verified', 'totalAppointments / answeredCalls * 100'),
      avgSentimentScore: buildKpi(currExp.avgSentimentScore, prevExp.avgSentimentScore, 'verified', 'AVG(sentiment_score) -1.0 to +1.0'),
      escalationRate: buildKpi(currEscRate, prevEscRate, 'verified', 'escalatedInteractions / totalInteractions * 100', true),
      totalAiCostUsd: buildKpi(Math.round(currCalls.totalCostUsd * 100) / 100, Math.round(prevCalls.totalCostUsd * 100) / 100, 'verified', 'SUM(cost_info.total_cost_usd)'),
      staffHoursSaved: buildKpi(currHoursSaved, prevHoursSaved, 'estimated', 'Heuristic estimate: 15 mins human staff time per answered call (subject to client calibration)'),
      netValueUsd: buildKpi(currNetVal, prevNetVal, 'estimated', 'Heuristic model: (staffHoursSaved * $25/hr benchmark) - totalAiCostUsd (not an audited billing ledger)'),
    },
    callVolumeSeries: timeSeries,
    hourlyHeatmap: heatmap,
    dispositions,
    topAgents: agentRankings.map((a) => ({
      ...a,
      answerRate: safePercentage(a.answeredCalls, a.totalCalls),
      avgSentimentScore: null,
      escalationRate: null,
      qualifiedLeads: 0,
      appointmentsBooked: 0,
    })),
  };
}

export function formatClientMetricsCsv(dashboard: ClientOverviewDashboardData): string {
  const headers = ['Metric', 'Current Period', 'Previous Period', 'Growth (%)', 'Measurement Status'];
  const rows = [
    ['Total Calls', dashboard.kpis.totalCalls.value ?? 'N/A', dashboard.kpis.totalCalls.previousValue ?? 'N/A', dashboard.kpis.totalCalls.deltaPercentage ?? 'N/A', 'Verified'],
    ['Answered Calls', dashboard.kpis.answeredCalls.value ?? 'N/A', dashboard.kpis.answeredCalls.previousValue ?? 'N/A', dashboard.kpis.answeredCalls.deltaPercentage ?? 'N/A', 'Verified'],
    ['Answer Rate (%)', dashboard.kpis.answerRate.value ?? 'N/A', dashboard.kpis.answerRate.previousValue ?? 'N/A', dashboard.kpis.answerRate.deltaPercentage ?? 'N/A', 'Verified'],
    ['Avg Duration (s)', dashboard.kpis.avgDurationSeconds.value ?? 'N/A', dashboard.kpis.avgDurationSeconds.previousValue ?? 'N/A', dashboard.kpis.avgDurationSeconds.deltaPercentage ?? 'N/A', 'Verified'],
    ['Total Leads', dashboard.kpis.totalLeads.value ?? 'N/A', dashboard.kpis.totalLeads.previousValue ?? 'N/A', dashboard.kpis.totalLeads.deltaPercentage ?? 'N/A', 'Verified'],
    ['Qualified Leads', dashboard.kpis.qualifiedLeads.value ?? 'N/A', dashboard.kpis.qualifiedLeads.previousValue ?? 'N/A', dashboard.kpis.qualifiedLeads.deltaPercentage ?? 'N/A', 'Verified'],
    ['Appointments', dashboard.kpis.totalAppointments.value ?? 'N/A', dashboard.kpis.totalAppointments.previousValue ?? 'N/A', dashboard.kpis.totalAppointments.deltaPercentage ?? 'N/A', 'Verified'],
    ['Staff Hours Saved', dashboard.kpis.staffHoursSaved.value ?? 'N/A', dashboard.kpis.staffHoursSaved.previousValue ?? 'N/A', dashboard.kpis.staffHoursSaved.deltaPercentage ?? 'N/A', 'Estimated'],
    ['Total AI Cost ($)', dashboard.kpis.totalAiCostUsd.value ?? 'N/A', dashboard.kpis.totalAiCostUsd.previousValue ?? 'N/A', dashboard.kpis.totalAiCostUsd.deltaPercentage ?? 'N/A', 'Verified'],
    ['Net Value ($)', dashboard.kpis.netValueUsd.value ?? 'N/A', dashboard.kpis.netValueUsd.previousValue ?? 'N/A', dashboard.kpis.netValueUsd.deltaPercentage ?? 'N/A', 'Estimated'],
  ];

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
