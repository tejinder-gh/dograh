import { describe, it, expect } from 'bun:test';
import { calculateLeadScore } from '../../domain/scoring';

describe('Deterministic Lead Scoring Engine', () => {
  it('calculates score for minimal contact with no profile completeness', () => {
    const result = calculateLeadScore({
      email: null,
      phone: null,
      company: null,
      role: null,
      lifecycleStatus: 'new',
      callAttempts: 0,
    });

    expect(result.score).toBe(0);
    expect(result.factors).toEqual({});
  });

  it('accumulates points for complete profile facts', () => {
    const result = calculateLeadScore({
      email: 'founder@techcorp.io',
      phone: '+14155551234',
      company: 'TechCorp Global',
      role: 'VP Engineering',
      lifecycleStatus: 'new',
      callAttempts: 0,
    });

    // email (15) + phone (15) + company (10) + role (10) = 50
    expect(result.score).toBe(50);
    expect(result.factors['valid_email']).toBe(15);
    expect(result.factors['valid_phone']).toBe(15);
    expect(result.factors['company_identified']).toBe(10);
    expect(result.factors['role_identified']).toBe(10);
  });

  it('adjusts score based on qualified lifecycle status', () => {
    const result = calculateLeadScore({
      email: 'lead@enterprise.com',
      phone: '+12125559876',
      company: 'Enterprise Inc',
      role: 'Director',
      lifecycleStatus: 'qualified',
      callAttempts: 1,
    });

    // 50 base + 25 qualified = 75
    expect(result.score).toBe(75);
    expect(result.factors['status_qualified']).toBe(25);
  });

  it('rewards booked status and positive verified interactions', () => {
    const result = calculateLeadScore(
      {
        email: 'lead@enterprise.com',
        phone: '+12125559876',
        company: 'Enterprise Inc',
        role: 'Director',
        lifecycleStatus: 'booked',
        callAttempts: 2,
      },
      [
        {
          durationSeconds: 240, // >= 180s (+15)
          sentimentCategory: 'positive', // (+10)
          wasEscalated: false,
        },
      ]
    );

    // 50 base + 35 booked + 25 interaction = 110 clamped to 100
    expect(result.score).toBe(100);
    expect(result.factors['status_booked']).toBe(35);
    expect(result.factors['verified_interactions']).toBe(25);
  });

  it('penalizes frustrated sentiment and escalation', () => {
    const result = calculateLeadScore(
      {
        email: 'angry@client.com',
        phone: '+12125559876',
        company: 'Angry Client LLC',
        role: 'Manager',
        lifecycleStatus: 'escalated',
        callAttempts: 1,
      },
      [
        {
          durationSeconds: 45,
          sentimentCategory: 'critical', // (-20)
          wasEscalated: true, // (-10)
        },
      ]
    );

    // 50 base - 10 escalated status - 30 interaction penalty = 10
    expect(result.score).toBe(10);
    expect(result.factors['status_escalated']).toBe(-10);
    expect(result.factors['verified_interactions']).toBe(-30);
  });

  it('strictly clamps result within [0, 100]', () => {
    const negativeResult = calculateLeadScore(
      {
        email: null,
        phone: null,
        company: null,
        role: null,
        lifecycleStatus: 'failed_retry', // -15
        callAttempts: 5,
      },
      [
        {
          durationSeconds: 10,
          sentimentCategory: 'critical', // -20
          wasEscalated: true, // -10
        },
      ]
    );

    expect(negativeResult.score).toBe(0);
  });
});
