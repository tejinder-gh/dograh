import type { Contact } from './contact.types';
import type { Interaction } from './interaction.types';

export interface ScoreBreakdown {
  score: number;
  factors: Record<string, number>;
  explanation: string;
}

/**
 * Deterministic lead scoring engine.
 * Computes lead score (0-100) strictly from verified business signals and interaction facts.
 * Avoids arbitrary AI hallucinated scores.
 */
export function calculateLeadScore(
  contact: Pick<Contact, 'email' | 'phone' | 'company' | 'role' | 'lifecycleStatus' | 'callAttempts'>,
  recentInteractions: Pick<Interaction, 'durationSeconds' | 'sentimentCategory' | 'wasEscalated'>[] = []
): ScoreBreakdown {
  const factors: Record<string, number> = {};
  let total = 0;

  // 1. Contact profile completeness
  if (contact.email && contact.email.includes('@')) {
    factors['valid_email'] = 15;
    total += 15;
  }
  if (contact.phone && contact.phone.trim().length >= 7) {
    factors['valid_phone'] = 15;
    total += 15;
  }
  if (contact.company && contact.company.trim().length > 1) {
    factors['company_identified'] = 10;
    total += 10;
  }
  if (contact.role && contact.role.trim().length > 1) {
    factors['role_identified'] = 10;
    total += 10;
  }

  // 2. Lifecycle status adjustments
  switch (contact.lifecycleStatus) {
    case 'qualified':
      factors['status_qualified'] = 25;
      total += 25;
      break;
    case 'booked':
      factors['status_booked'] = 35;
      total += 35;
      break;
    case 'connected':
      factors['status_connected'] = 10;
      total += 10;
      break;
    case 'failed_retry':
      factors['status_failed_retry'] = -15;
      total -= 15;
      break;
    case 'escalated':
      factors['status_escalated'] = -10;
      total -= 10;
      break;
    default:
      break;
  }

  // 3. Interaction history signals
  if (recentInteractions.length > 0) {
    let interactionScore = 0;
    for (const inter of recentInteractions) {
      if (inter.durationSeconds >= 180) {
        interactionScore += 15;
      } else if (inter.durationSeconds >= 60) {
        interactionScore += 10;
      }

      if (inter.sentimentCategory === 'positive') {
        interactionScore += 10;
      } else if (inter.sentimentCategory === 'frustrated') {
        interactionScore -= 10;
      } else if (inter.sentimentCategory === 'critical') {
        interactionScore -= 20;
      }

      if (inter.wasEscalated) {
        interactionScore -= 10;
      }
    }
    // Cap interaction influence to [-30, +30]
    const cappedInteraction = Math.max(-30, Math.min(30, interactionScore));
    factors['verified_interactions'] = cappedInteraction;
    total += cappedInteraction;
  }

  // Clamp total between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(total)));

  return {
    score: finalScore,
    factors,
    explanation: Object.entries(factors)
      .map(([k, v]) => `${k}: ${v >= 0 ? '+' : ''}${v}`)
      .join(', '),
  };
}
