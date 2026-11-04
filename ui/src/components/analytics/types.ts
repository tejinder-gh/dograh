export interface KpiMetric<T = number> {
  value: T | null;
  previousValue: T | null;
  deltaPercentage: number | null;
  trend: 'up' | 'down' | 'flat' | 'neutral';
  status: 'verified' | 'estimated' | 'unavailable';
  formulaExplanation?: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  totalCalls: number;
  answeredCalls: number;
  failedCalls: number;
  aiCostUsd: number;
  talkTimeSeconds: number;
}

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  callCount: number;
}

export interface DispositionSlice {
  disposition: string;
  count: number;
  percentage: number | null;
}

export interface AgentPerformanceRow {
  agentId: number;
  agentName: string;
  totalCalls: number;
  answeredCalls: number;
  answerRate: number | null;
  avgDurationSeconds: number | null;
  avgSentimentScore: number | null;
  escalationRate: number | null;
  qualifiedLeads: number;
  appointmentsBooked: number;
  totalCostUsd: number;
}

export interface ClientOverviewDashboardData {
  timeframe: { from: string; to: string; comparePeriod?: { from: string; to: string } };
  kpis: {
    totalCalls: KpiMetric<number>;
    answeredCalls: KpiMetric<number>;
    answerRate: KpiMetric<number>;
    avgDurationSeconds: KpiMetric<number>;
    totalLeads: KpiMetric<number>;
    qualifiedLeads: KpiMetric<number>;
    leadConversionRate: KpiMetric<number>;
    totalAppointments: KpiMetric<number>;
    confirmedAppointments: KpiMetric<number>;
    appointmentRate: KpiMetric<number>;
    avgSentimentScore: KpiMetric<number>;
    escalationRate: KpiMetric<number>;
    totalAiCostUsd: KpiMetric<number>;
    staffHoursSaved: KpiMetric<number>;
    netValueUsd: KpiMetric<number>;
  };
  callVolumeSeries: TimeSeriesPoint[];
  hourlyHeatmap: HeatmapCell[];
  dispositions: DispositionSlice[];
  topAgents: AgentPerformanceRow[];
}

export interface ClientPortfolioRow {
  organizationId: number;
  organizationName: string;
  tenantId: string;
  createdAt: string;
  activeAgentsCount: number;
  totalCalls: number;
  totalMinutes: number;
  totalCostUsd: number;
  recognizedRevenueUsd: number | null;
  status: 'active' | 'trial' | 'churned' | 'suspended';
}

export interface PlatformOverviewDashboardData {
  timeframe: { from: string; to: string };
  kpis: {
    totalClients: KpiMetric<number>;
    activeClients: KpiMetric<number>;
    netClientGrowth: KpiMetric<number>;
    totalPlatformCalls: KpiMetric<number>;
    platformAnswerRate: KpiMetric<number>;
    totalPlatformMinutes: KpiMetric<number>;
    totalPlatformAiCostUsd: KpiMetric<number>;
    recognizedRevenueUsd: KpiMetric<number>;
    grossProfitUsd: KpiMetric<number>;
    grossMarginPercentage: KpiMetric<number>;
    turnLatencyP95Ms: KpiMetric<number>;
    errorRatePercentage: KpiMetric<number>;
  };
  clientPortfolio: ClientPortfolioRow[];
  usageTrend: TimeSeriesPoint[];
  providerBreakdown: { provider: string; model: string; callCount: number; costUsd: number }[];
}

export type TimeRangePreset = '7d' | '30d' | '90d' | 'ytd';
