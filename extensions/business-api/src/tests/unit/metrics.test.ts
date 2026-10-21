import { describe, it, expect } from 'bun:test';
import {
  safePercentage,
  safeRatio,
  safeDelta,
  METRIC_REGISTRY,
} from '../../domain/metrics.registry';

describe('Metrics Registry & Safe Math Calculations', () => {
  it('registers all enterprise analytics metrics with valid metadata', () => {
    expect(METRIC_REGISTRY.calls_total).toBeDefined();
    expect(METRIC_REGISTRY.calls_answered).toBeDefined();
    expect(METRIC_REGISTRY.call_answer_rate).toBeDefined();
    expect(METRIC_REGISTRY.leads_total).toBeDefined();
    expect(METRIC_REGISTRY.leads_qualified).toBeDefined();
    expect(METRIC_REGISTRY.appointments_total).toBeDefined();
    expect(METRIC_REGISTRY.gross_profit).toBeDefined();
    expect(METRIC_REGISTRY.gross_margin).toBeDefined();
  });

  describe('safePercentage', () => {
    it('returns null when denominator is 0 (never arbitrary 0% or NaN)', () => {
      expect(safePercentage(10, 0)).toBeNull();
      expect(safePercentage(0, 0)).toBeNull();
    });

    it('returns null when numerator or denominator is null or undefined', () => {
      expect(safePercentage(null, 100)).toBeNull();
      expect(safePercentage(50, null)).toBeNull();
      expect(safePercentage(undefined, undefined)).toBeNull();
    });

    it('correctly calculates percentage with standard rounding', () => {
      expect(safePercentage(50, 100)).toBe(50);
      expect(safePercentage(1, 3, 1)).toBe(33.3);
      expect(safePercentage(2, 3, 2)).toBe(66.67);
      expect(safePercentage(0, 100)).toBe(0);
    });
  });

  describe('safeRatio', () => {
    it('returns null when denominator is 0, null, or undefined', () => {
      expect(safeRatio(10, 0)).toBeNull();
      expect(safeRatio(null, 5)).toBeNull();
      expect(safeRatio(10, undefined)).toBeNull();
    });

    it('correctly calculates ratio', () => {
      expect(safeRatio(15, 3)).toBe(5);
      expect(safeRatio(10, 4, 2)).toBe(2.5);
    });
  });

  describe('safeDelta', () => {
    it('returns null when previous period value is 0, null, or undefined', () => {
      expect(safeDelta(100, 0)).toBeNull();
      expect(safeDelta(100, null)).toBeNull();
      expect(safeDelta(null, 100)).toBeNull();
    });

    it('correctly calculates growth and decline percentages', () => {
      // 100 -> 150 = +50%
      expect(safeDelta(150, 100)).toBe(50);
      // 100 -> 80 = -20%
      expect(safeDelta(80, 100)).toBe(-20);
      // 100 -> 100 = 0%
      expect(safeDelta(100, 100)).toBe(0);
      // 30 -> 45 = +50%
      expect(safeDelta(45, 30)).toBe(50);
    });
  });
});
