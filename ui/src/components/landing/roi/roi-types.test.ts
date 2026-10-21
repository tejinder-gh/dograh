import { describe, expect, it } from 'vitest';

import { calculateRoi, ROI_PRESETS } from './roi-types';

describe('calculateRoi mathematical derivation suite', () => {
  it('correctly derives savings and FTE equivalence for growth preset', () => {
    // 7,500 calls * (4.5 min / 60) = 562.5 -> 563 hours saved
    // 563 hrs * $30/hr = $16,890 human staff cost
    // 7,500 calls * 4.5 min * $0.022 = $742.5 -> $743 AI cost
    // net monthly savings = $16,890 - $743 = $16,147
    // annual savings = $16,147 * 12 = $193,764
    // savings percent = round(16,147 / 16,890 * 100) = 96%
    const res = calculateRoi(7500, 4.5, 30);

    expect(res.staffHoursSaved).toBe(563);
    expect(res.humanStaffCost).toBe(16890);
    expect(res.aiOperatingCost).toBe(743);
    expect(res.netMonthlySavings).toBe(16147);
    expect(res.annualSavings).toBe(193764);
    expect(res.savingsPercent).toBe(96);
    expect(res.equivalentFte).toBe(3.5); // 563 / 160 = 3.518 -> 3.5
    expect(res.costPerHumanCall).toBe(2.25); // 16,890 / 7,500
    expect(res.costPerAiCall).toBe(0.099); // 743 / 7,500
  });

  it('safely handles zero call volume without NaN or Infinity', () => {
    const res = calculateRoi(0, 5, 25);

    expect(res.staffHoursSaved).toBe(0);
    expect(res.humanStaffCost).toBe(0);
    expect(res.aiOperatingCost).toBe(0);
    expect(res.netMonthlySavings).toBe(0);
    expect(res.annualSavings).toBe(0);
    expect(res.savingsPercent).toBe(0);
    expect(res.equivalentFte).toBe(0);
    expect(res.costPerHumanCall).toBe(0);
    expect(res.costPerAiCall).toBe(0);
    expect(Number.isNaN(res.netMonthlySavings)).toBe(false);
  });

  it('validates that all predefined presets calculate non-negative savings', () => {
    ROI_PRESETS.forEach((preset) => {
      const res = calculateRoi(preset.callVolume, preset.durationMins, preset.hourlyWage);
      expect(res.netMonthlySavings).toBeGreaterThan(0);
      expect(res.annualSavings).toBeGreaterThan(0);
      expect(res.savingsPercent).toBeGreaterThan(70);
      expect(res.equivalentFte).toBeGreaterThan(0);
    });
  });
});
