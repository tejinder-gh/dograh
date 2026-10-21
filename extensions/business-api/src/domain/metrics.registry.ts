export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  formula: string;
  sourceTable: string;
  sourceField: string;
  scope: 'client' | 'platform' | 'both';
  grain: 'call' | 'contact' | 'booking' | 'day' | 'month' | 'cohort';
  unit: 'count' | 'percentage' | 'currency_usd' | 'seconds' | 'minutes' | 'hours' | 'ratio';
}

export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
  calls_total: {
    id: 'calls_total',
    name: 'Total Calls',
    description: 'Total call sessions initiated or received',
    formula: 'COUNT(*)',
    sourceTable: 'public.workflow_runs',
    sourceField: 'id',
    scope: 'both',
    grain: 'call',
    unit: 'count',
  },
  calls_answered: {
    id: 'calls_answered',
    name: 'Answered Calls',
    description: 'Calls where conversational audio stream was successfully connected',
    formula: "COUNT(*) WHERE state = 'completed' OR duration > 0",
    sourceTable: 'public.workflow_runs',
    sourceField: 'state, usage_info',
    scope: 'both',
    grain: 'call',
    unit: 'count',
  },
  calls_failed: {
    id: 'calls_failed',
    name: 'Failed Calls',
    description: 'Technical or telephony setup failures',
    formula: "COUNT(*) WHERE state IN ('failed', 'timed_out')",
    sourceTable: 'public.workflow_runs',
    sourceField: 'state',
    scope: 'both',
    grain: 'call',
    unit: 'count',
  },
  calls_missed: {
    id: 'calls_missed',
    name: 'Missed Calls',
    description: 'Inbound calls where caller disconnected before agent answer',
    formula: "COUNT(*) WHERE call_type = 'inbound' AND state = 'initialized'",
    sourceTable: 'public.workflow_runs',
    sourceField: 'call_type, state',
    scope: 'both',
    grain: 'call',
    unit: 'count',
  },
  call_answer_rate: {
    id: 'call_answer_rate',
    name: 'Answer Rate',
    description: 'Proportion of total call attempts successfully connected',
    formula: 'calls_answered / calls_total * 100',
    sourceTable: 'derived',
    sourceField: 'derived',
    scope: 'both',
    grain: 'day',
    unit: 'percentage',
  },
  call_talk_time_total: {
    id: 'call_talk_time_total',
    name: 'Total Talk Time',
    description: 'Cumulative handled conversation time in minutes',
    formula: 'SUM(duration_seconds) / 60',
    sourceTable: 'public.workflow_runs',
    sourceField: 'usage_info.duration',
    scope: 'both',
    grain: 'day',
    unit: 'minutes',
  },
  call_talk_time_avg: {
    id: 'call_talk_time_avg',
    name: 'Average Talk Time',
    description: 'Average handled talk time per answered call',
    formula: 'SUM(duration_seconds) / calls_answered',
    sourceTable: 'public.workflow_runs',
    sourceField: 'usage_info.duration',
    scope: 'both',
    grain: 'day',
    unit: 'seconds',
  },
  leads_total: {
    id: 'leads_total',
    name: 'Total Leads',
    description: 'Contacts created or engaged in CRM',
    formula: 'COUNT(*)',
    sourceTable: 'business_ext.contacts',
    sourceField: 'id',
    scope: 'both',
    grain: 'contact',
    unit: 'count',
  },
  leads_qualified: {
    id: 'leads_qualified',
    name: 'Qualified Leads',
    description: 'Contacts assessed as meeting qualification criteria',
    formula: "COUNT(*) WHERE lifecycle_status = 'qualified'",
    sourceTable: 'business_ext.contacts',
    sourceField: 'lifecycle_status',
    scope: 'both',
    grain: 'contact',
    unit: 'count',
  },
  lead_conversion_rate: {
    id: 'lead_conversion_rate',
    name: 'Lead Conversion Rate',
    description: 'Percentage of total leads converted to qualified status',
    formula: 'leads_qualified / leads_total * 100',
    sourceTable: 'derived',
    sourceField: 'derived',
    scope: 'both',
    grain: 'day',
    unit: 'percentage',
  },
  appointments_total: {
    id: 'appointments_total',
    name: 'Total Bookings',
    description: 'Total appointments scheduled through voice agent or CRM',
    formula: 'COUNT(*)',
    sourceTable: 'business_ext.appointments',
    sourceField: 'id',
    scope: 'both',
    grain: 'booking',
    unit: 'count',
  },
  appointments_confirmed: {
    id: 'appointments_confirmed',
    name: 'Confirmed Bookings',
    description: 'Bookings in confirmed or completed status',
    formula: "COUNT(*) WHERE status IN ('confirmed', 'completed')",
    sourceTable: 'business_ext.appointments',
    sourceField: 'status',
    scope: 'both',
    grain: 'booking',
    unit: 'count',
  },
  ai_cost_total: {
    id: 'ai_cost_total',
    name: 'Total AI Spend',
    description: 'Total provider cost for LLM, TTS, STT, and voice infrastructure',
    formula: 'SUM(cost_info.total_cost_usd)',
    sourceTable: 'public.workflow_runs',
    sourceField: 'cost_info',
    scope: 'both',
    grain: 'call',
    unit: 'currency_usd',
  },
  revenue_recognized: {
    id: 'revenue_recognized',
    name: 'Recognized Revenue',
    description: 'Invoiced and captured customer revenue',
    formula: 'SUM(amount_cents) / 100',
    sourceTable: 'public.organization_usage_cycles',
    sourceField: 'amount_cents',
    scope: 'platform',
    grain: 'month',
    unit: 'currency_usd',
  },
  gross_profit: {
    id: 'gross_profit',
    name: 'Gross Profit',
    description: 'Recognized revenue minus direct AI model provider costs',
    formula: 'revenue_recognized - ai_cost_total',
    sourceTable: 'derived',
    sourceField: 'derived',
    scope: 'platform',
    grain: 'month',
    unit: 'currency_usd',
  },
  gross_margin: {
    id: 'gross_margin',
    name: 'Gross Margin',
    description: 'Gross profit as percentage of recognized revenue',
    formula: 'gross_profit / revenue_recognized * 100',
    sourceTable: 'derived',
    sourceField: 'derived',
    scope: 'platform',
    grain: 'month',
    unit: 'percentage',
  },
  hours_saved: {
    id: 'hours_saved',
    name: 'Staff Hours Saved',
    description: 'Estimated human staff hours conserved through automated call handling',
    formula: 'calls_answered * (assumed_minutes_per_call / 60)',
    sourceTable: 'derived',
    sourceField: 'derived',
    scope: 'client',
    grain: 'month',
    unit: 'hours',
  },
};

/**
 * Computes percentage with zero-denominator safety.
 * Returns null if denominator is 0, null, or undefined (rendered as 'N/A' on UI).
 */
export function safePercentage(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  decimals = 1
): number | null {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator === 0 ||
    isNaN(numerator) ||
    isNaN(denominator)
  ) {
    return null;
  }
  const factor = Math.pow(10, decimals);
  return Math.round((numerator / denominator) * 100 * factor) / factor;
}

/**
 * Computes ratio with zero-denominator safety.
 */
export function safeRatio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  decimals = 2
): number | null {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator === 0 ||
    isNaN(numerator) ||
    isNaN(denominator)
  ) {
    return null;
  }
  const factor = Math.pow(10, decimals);
  return Math.round((numerator / denominator) * factor) / factor;
}

/**
 * Computes delta percentage between current and previous periods.
 * Returns null if previous period is 0 or missing (cannot calculate relative growth).
 */
export function safeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  decimals = 1
): number | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    previous === 0 ||
    isNaN(current) ||
    isNaN(previous)
  ) {
    return null;
  }
  const factor = Math.pow(10, decimals);
  return Math.round(((current - previous) / previous) * 100 * factor) / factor;
}
