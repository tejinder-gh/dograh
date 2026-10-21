import {
  safePercentage,
  safeDelta,
} from '../domain/metrics.registry';
import type {
  AnalyticsTimeFilter,
  PlatformOverviewDashboardData,
  KpiMetric,
  ClientPortfolioRow,
} from '../domain/analytics.types';
import {
  fetchPlatformExecutiveSummary,
  fetchPlatformClientPortfolio,
  fetchPlatformUsageTrend,
  fetchPlatformProviderBreakdown,
} from '../repositories/platform-analytics.repository';
import { resolveTimeWindows } from './client-analytics.service';

function buildPlatformKpi<T extends number>(
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

export async function getPlatformOverviewDashboard(
  filter: AnalyticsTimeFilter
): Promise<PlatformOverviewDashboardData> {
  const { currentFrom, currentTo, prevFrom, prevTo } = resolveTimeWindows(filter);

  const [
    currSummary,
    prevSummary,
    portfolio,
    usageTrend,
    providerBreakdown,
  ] = await Promise.all([
    fetchPlatformExecutiveSummary(currentFrom, currentTo),
    fetchPlatformExecutiveSummary(prevFrom, prevTo),
    fetchPlatformClientPortfolio(currentFrom, currentTo),
    fetchPlatformUsageTrend(currentFrom, currentTo),
    fetchPlatformProviderBreakdown(currentFrom, currentTo),
  ]);

  const currAnswerRate = safePercentage(currSummary.answeredCalls, currSummary.totalPlatformCalls);
  const prevAnswerRate = safePercentage(prevSummary.answeredCalls, prevSummary.totalPlatformCalls);

  const currErrorRate = safePercentage(currSummary.failedCalls, currSummary.totalPlatformCalls);
  const prevErrorRate = safePercentage(prevSummary.failedCalls, prevSummary.totalPlatformCalls);

  // Financial reconciliation: revenue minus AI cost
  let grossProfit: number | null = null;
  let grossMargin: number | null = null;
  const revStatus: 'verified' | 'unavailable' =
    currSummary.recognizedRevenueUsd !== null ? 'verified' : 'unavailable';

  if (currSummary.recognizedRevenueUsd !== null) {
    grossProfit = Math.round((currSummary.recognizedRevenueUsd - currSummary.totalAiCostUsd) * 100) / 100;
    grossMargin = safePercentage(grossProfit, currSummary.recognizedRevenueUsd);
  }

  return {
    timeframe: {
      from: currentFrom.toISOString(),
      to: currentTo.toISOString(),
    },
    kpis: {
      totalClients: buildPlatformKpi(currSummary.totalClients, prevSummary.totalClients, 'verified', 'COUNT(*) total organizations in database'),
      activeClients: buildPlatformKpi(currSummary.activeClients, prevSummary.activeClients, 'verified', 'Organizations with active call traffic in period'),
      netClientGrowth: buildPlatformKpi(currSummary.newClients, prevSummary.newClients, 'verified', 'New organizations registered in period (subscription growth uninstrumented)'),
      totalPlatformCalls: buildPlatformKpi(currSummary.totalPlatformCalls, prevSummary.totalPlatformCalls, 'verified', 'Total workflow runs across all platform tenants'),
      platformAnswerRate: buildPlatformKpi(currAnswerRate, prevAnswerRate, 'verified', 'answeredCalls / totalPlatformCalls * 100'),
      totalPlatformMinutes: buildPlatformKpi(Math.round(currSummary.totalMinutes), Math.round(prevSummary.totalMinutes), 'verified', 'SUM(usage_info.call_duration_seconds) / 60'),
      totalPlatformAiCostUsd: buildPlatformKpi(Math.round(currSummary.totalAiCostUsd * 100) / 100, Math.round(prevSummary.totalAiCostUsd * 100) / 100, 'verified', 'Direct provider LLM/TTS/STT spend'),
      recognizedRevenueUsd: buildPlatformKpi(currSummary.recognizedRevenueUsd, prevSummary.recognizedRevenueUsd, revStatus, 'Recognized invoiced revenue (Unavailable if billing unconfigured)'),
      grossProfitUsd: buildPlatformKpi(grossProfit, null, revStatus, 'recognizedRevenue - directAiCost'),
      grossMarginPercentage: buildPlatformKpi(grossMargin, null, revStatus, 'grossProfit / recognizedRevenue * 100'),
      turnLatencyP95Ms: buildPlatformKpi(null, null, 'unavailable', 'P95 conversational turn latency (Real-time pipeline telemetry uninstrumented)', true),
      errorRatePercentage: buildPlatformKpi(currErrorRate, prevErrorRate, 'verified', 'failedRuns / totalPlatformCalls * 100', true),
    },
    clientPortfolio: portfolio,
    usageTrend,
    providerBreakdown,
  };
}

export function formatClientPortfolioCsv(clients: ClientPortfolioRow[]): string {
  const headers = [
    'Organization ID',
    'Organization Name',
    'Tenant ID',
    'Status',
    'Active Agents',
    'Total Calls',
    'Total Minutes',
    'AI Cost (USD)',
    'Created At',
  ];
  const rows = clients.map((c) => [
    c.organizationId,
    `"${c.organizationName.replace(/"/g, '""')}"`,
    c.tenantId,
    c.status,
    c.activeAgentsCount,
    c.totalCalls,
    c.totalMinutes,
    `$${c.totalCostUsd.toFixed(2)}`,
    c.createdAt,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
