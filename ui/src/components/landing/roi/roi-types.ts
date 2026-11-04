export interface RoiPreset {
  id: string;
  name: string;
  description: string;
  callVolume: number;
  durationMins: number;
  hourlyWage: number;
}

export interface RoiCalculationResult {
  staffHoursSaved: number;
  humanStaffCost: number;
  aiOperatingCost: number;
  netMonthlySavings: number;
  annualSavings: number;
  savingsPercent: number;
  equivalentFte: number;
  costPerHumanCall: number;
  costPerAiCall: number;
}

export const ROI_PRESETS: readonly RoiPreset[] = [
  {
    id: 'clinic',
    name: 'Clinic & Reception',
    description: 'Patient scheduling & intake calls',
    callVolume: 2500,
    durationMins: 3.5,
    hourlyWage: 24,
  },
  {
    id: 'growth',
    name: 'B2B Qualification',
    description: 'Inbound lead triage & discovery',
    callVolume: 7500,
    durationMins: 4.5,
    hourlyWage: 30,
  },
  {
    id: 'support',
    name: 'Customer Support Desk',
    description: 'Tier-1 resolution & status updates',
    callVolume: 20000,
    durationMins: 4,
    hourlyWage: 26,
  },
  {
    id: 'enterprise',
    name: 'Enterprise 24/7 Fleet',
    description: 'Nationwide dispatch & reservations',
    callVolume: 45000,
    durationMins: 5,
    hourlyWage: 32,
  },
] as const;

/**
 * Derives comprehensive operational and unit economics for a voice AI deployment.
 * Standard industry benchmark rates:
 * - Neural voice pipeline: ~$0.022/min (TTS + STT + LLM token streaming)
 * - Standard full-time employee (FTE) monthly hours: ~160 hours
 */
export function calculateRoi(
  callVolume: number,
  durationMins: number,
  hourlyWage: number
): RoiCalculationResult {
  const staffHoursSaved = Math.round(callVolume * (durationMins / 60));
  const humanStaffCost = Math.round(staffHoursSaved * hourlyWage);
  const aiOperatingCost = Math.round(callVolume * durationMins * 0.022);
  const netMonthlySavings = Math.max(0, humanStaffCost - aiOperatingCost);
  const annualSavings = netMonthlySavings * 12;
  const savingsPercent = humanStaffCost > 0 ? Math.round((netMonthlySavings / humanStaffCost) * 100) : 0;
  const equivalentFte = Number((staffHoursSaved / 160).toFixed(1));
  const costPerHumanCall = callVolume > 0 ? Number((humanStaffCost / callVolume).toFixed(2)) : 0;
  const costPerAiCall = callVolume > 0 ? Number((aiOperatingCost / callVolume).toFixed(3)) : 0;

  return {
    staffHoursSaved,
    humanStaffCost,
    aiOperatingCost,
    netMonthlySavings,
    annualSavings,
    savingsPercent,
    equivalentFte,
    costPerHumanCall,
    costPerAiCall,
  };
}
