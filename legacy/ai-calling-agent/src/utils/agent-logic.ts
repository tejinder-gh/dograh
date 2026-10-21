/**
 * AcuityVoice Core Logic & Rules
 * Pure utility functions for sentiment evaluation, escalation triggers,
 * lead qualification scoring, and time formatting.
 */
import type { PlatformLeadField } from '../types.ts';

export type SentimentCategory = 'positive' | 'neutral' | 'frustrated' | 'critical';

export interface EscalationAssessment {
  isEscalated: boolean;
  reason?: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface LeadQualificationInput {
  budgetMentioned: boolean;
  authorityLevel: 'decision_maker' | 'influencer' | 'individual';
  needUrgency: 'immediate' | 'planning' | 'casual';
  timelineWeeks: number;
}

export interface LeadQualificationResult {
  leadScore: number;
  isQualified: boolean;
  tier: 'enterprise' | 'growth' | 'standard';
}

/**
 * Categorize numeric sentiment score (-100 to 100)
 */
export function getSentimentCategory(score: number): SentimentCategory {
  if (score <= -50) return 'critical';
  if (score < 0) return 'frustrated';
  if (score <= 35) return 'neutral';
  return 'positive';
}

/**
 * Evaluate whether an interaction requires escalation to a human supervisor
 */
export function evaluateEscalationStatus(
  sentimentScore: number,
  message: string,
  consecutiveNegativeCount: number = 0
): EscalationAssessment {
  const normalized = message.toLowerCase();

  // Explicit high-urgency keywords
  const criticalPhrases = [
    'speak to human',
    'speak to representative',
    'speak to supervisor',
    'talk to a manager',
    'cancel my subscription',
    'lawsuit',
    'fraudulent charge',
    'legal action',
    'unacceptable service',
    'immediate escalation'
  ];

  for (const phrase of criticalPhrases) {
    if (normalized.includes(phrase)) {
      return {
        isEscalated: true,
        reason: `Explicit escalation request: "${phrase}"`,
        urgencyLevel: 'critical',
      };
    }
  }

  // Sentiment threshold triggers
  if (sentimentScore <= -55) {
    return {
      isEscalated: true,
      reason: 'Critical customer distress threshold reached (score < -55)',
      urgencyLevel: 'critical',
    };
  }

  if (sentimentScore <= -25 && consecutiveNegativeCount >= 2) {
    return {
      isEscalated: true,
      reason: 'Repeated negative sentiment across consecutive responses',
      urgencyLevel: 'high',
    };
  }

  if (sentimentScore < 0) {
    return {
      isEscalated: false,
      reason: undefined,
      urgencyLevel: 'medium',
    };
  }

  return {
    isEscalated: false,
    reason: undefined,
    urgencyLevel: 'low',
  };
}

/**
 * Calculate BANT Lead Qualification Score (0-100)
 */
export function calculateLeadQualification(input: LeadQualificationInput): LeadQualificationResult {
  let score = 0;

  // Budget
  if (input.budgetMentioned) {
    score += 30;
  }

  // Authority
  if (input.authorityLevel === 'decision_maker') {
    score += 30;
  } else if (input.authorityLevel === 'influencer') {
    score += 20;
  } else {
    score += 10;
  }

  // Need
  if (input.needUrgency === 'immediate') {
    score += 25;
  } else if (input.needUrgency === 'planning') {
    score += 15;
  } else {
    score += 5;
  }

  // Timeline
  if (input.timelineWeeks <= 4) {
    score += 15;
  } else if (input.timelineWeeks <= 12) {
    score += 10;
  } else {
    score += 5;
  }

  const isQualified = score >= 60;
  let tier: 'enterprise' | 'growth' | 'standard' = 'standard';

  if (score >= 80) {
    tier = 'enterprise';
  } else if (score >= 60) {
    tier = 'growth';
  }

  return {
    leadScore: Math.min(100, Math.max(0, score)),
    isQualified,
    tier,
  };
}

/**
 * Format call duration from seconds to MM:SS or HH:MM:SS
 */
export function formatCallDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${pad(hrs)}:${pad(remMins)}:${pad(secs)}`;
  }

  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Detect meeting / session booking intent in user message
 */
export function parseBookingIntent(message: string): { hasBookingIntent: boolean; matchedTerm?: string } {
  const normalized = message.toLowerCase();
  const triggers = [
    'book a session',
    'schedule a call',
    'schedule a demo',
    'book demo',
    'talk with someone',
    'meet with',
    'calendar',
    'schedule time',
    'one on one',
    '1 on 1',
    'consultation',
    'pricing call',
    'representative'
  ];

  for (const trigger of triggers) {
    if (normalized.includes(trigger)) {
      return { hasBookingIntent: true, matchedTerm: trigger };
    }
  }

  return { hasBookingIntent: false };
}

/**
 * Parse raw CSV text into headers and row objects
 */
export function parseCsvContent(rawCsv: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!rawCsv || !rawCsv.trim()) {
    return { headers: [], rows: [] };
  }

  const lines = rawCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  // Parse header line
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, index) => {
      rowObj[h] = values[index] || '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Heuristically map arbitrarily named CSV headers to standard platform lead fields
 */
export function smartMapCsvHeaders(headers: string[]): Record<string, PlatformLeadField> {
  const mapping: Record<string, PlatformLeadField> = {};

  for (const header of headers) {
    const lower = header.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      lower.includes('email') ||
      lower.includes('mail') ||
      lower.includes('female') || // user specified typo example: "customer female" -> email
      lower.includes('e-mail')
    ) {
      mapping[header] = 'email';
    } else if (
      lower.includes('phone') ||
      lower.includes('cell') ||
      lower.includes('mobile') ||
      lower.includes('tel')
    ) {
      mapping[header] = 'phone';
    } else if (
      lower.includes('fullname') ||
      lower.includes('clientname') ||
      lower.includes('customername') ||
      lower.includes('leadname') ||
      lower === 'name' ||
      lower === 'contact'
    ) {
      mapping[header] = 'name';
    } else if (
      lower.includes('company') ||
      lower.includes('organization') ||
      lower.includes('biz') ||
      lower.includes('corp') ||
      lower.includes('business') ||
      lower.includes('firm')
    ) {
      mapping[header] = 'company';
    } else if (
      lower.includes('title') ||
      lower.includes('role') ||
      lower.includes('position') ||
      lower.includes('designation')
    ) {
      mapping[header] = 'role';
    } else if (
      lower.includes('budget') ||
      lower.includes('spend') ||
      lower.includes('arr') ||
      lower.includes('deal') ||
      lower.includes('value')
    ) {
      mapping[header] = 'estimatedValue';
    } else if (lower.includes('time') || lower.includes('urgency') || lower.includes('when')) {
      mapping[header] = 'timeline';
    } else if (lower.includes('note') || lower.includes('comment') || lower.includes('desc')) {
      mapping[header] = 'notes';
    } else {
      mapping[header] = 'ignore';
    }
  }

  return mapping;
}

/**
 * Build rich Google Calendar event description with full attraction & interaction summaries
 */
export function buildGoogleCalendarDescription(params: {
  leadName: string;
  company: string;
  email: string;
  phone: string;
  repName: string;
  repRole: string;
  meetingGoal: string;
  transcriptSummary: string;
  bantScore: number;
  calendarLink?: string;
  keyActionItems?: string[];
}): string {
  const itemsText = params.keyActionItems && params.keyActionItems.length > 0
    ? params.keyActionItems.map((item) => `  • ${item}`).join('\n')
    : '  • Review custom architecture fit\n  • Present tailored ROI model\n  • Confirm timeline and pilot parameters';

  return `========================================
ACUITYVOICE 1-ON-1 LEAD NURTURING SESSION
========================================

PROSPECT & COMPANY PROFILE:
• Name: ${params.leadName}
• Organization: ${params.company}
• Email: ${params.email}
• Phone: ${params.phone}
• BANT Qualification Score: ${params.bantScore}/100

ASSIGNED COMPANY SPECIALIST:
• Representative: ${params.repName} (${params.repRole})

SESSION GOAL & OBJECTIVE:
${params.meetingGoal}

INTERACTION & ATTRACTION SUMMARY (FROM LIVE AI CALL/CHAT):
${params.transcriptSummary}

PREPARATION & KEY ACTION ITEMS:
${itemsText}

${params.calendarLink ? `DIRECT CALENDAR ACCESS LINK: ${params.calendarLink}\n` : ''}
Auto-generated & synchronized by AcuityVoice Omnichannel AI Agent.`;
}

/**
 * Accurately parses date and timeSlot strings into authoritative ISO start and end timestamps.
 * Enforces IANA timezone conversion, eliminates hardcoded 'Z' assumptions, validates calendar dates,
 * and handles 12-hour AM/PM and 24-hour formats with DST compliance.
 */
export function parseTimeSlotToISO(
  dateStr: string,
  timeSlotStr: string,
  durationMinutes: number = 30,
  timeZone: string = 'UTC'
): { startIso: string; endIso: string } {
  if (!dateStr || typeof dateStr !== 'string' || !timeSlotStr || typeof timeSlotStr !== 'string') {
    throw new Error('Valid date and timeSlot strings are required');
  }

  const dateParts = dateStr.trim().split('-');
  if (dateParts.length !== 3) {
    throw new Error(`Invalid date format "${dateStr}". Expected YYYY-MM-DD.`);
  }

  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10);
  const day = parseInt(dateParts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid date "${dateStr}"`);
  }

  // Verify calendar validity (reject February 30/31, April 31, etc.)
  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    throw new Error(`Non-existent calendar date "${dateStr}"`);
  }

  // Detect time zone abbreviation in time slot string
  let targetTz = timeZone || 'UTC';
  const tzMatch = timeSlotStr.match(/\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT)\b/i);
  if (tzMatch) {
    const abbr = tzMatch[1].toUpperCase();
    const tzAbbrMap: Record<string, string> = {
      EST: 'America/New_York',
      EDT: 'America/New_York',
      CST: 'America/Chicago',
      CDT: 'America/Chicago',
      MST: 'America/Denver',
      MDT: 'America/Denver',
      PST: 'America/Los_Angeles',
      PDT: 'America/Los_Angeles',
      UTC: 'UTC',
      GMT: 'UTC',
    };
    if (tzAbbrMap[abbr]) {
      targetTz = tzAbbrMap[abbr];
    }
  }

  const timeMatch = timeSlotStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!timeMatch) {
    throw new Error(`Invalid time format in "${timeSlotStr}". Expected HH:MM or HH:MM AM/PM.`);
  }

  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const meridiem = timeMatch[3]?.toLowerCase();

  if (minute < 0 || minute > 59) {
    throw new Error(`Invalid minute "${minute}" in "${timeSlotStr}"`);
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      throw new Error(`Invalid 12-hour hour "${hour}" in "${timeSlotStr}"`);
    }
    if (meridiem === 'pm' && hour < 12) hour += 12;
    else if (meridiem === 'am' && hour === 12) hour = 0;
  } else {
    if (hour < 0 || hour > 23) {
      throw new Error(`Invalid 24-hour hour "${hour}" in "${timeSlotStr}"`);
    }
  }

  // Calculate UTC timestamp from target timezone wall clock
  const targetWallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  // Iteratively converge to exact UTC timestamp matching target wall clock in targetTz
  let utcGuess = targetWallClockUtc;
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(utcGuess));
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
    }
    const formattedHour = map.hour === 24 ? 0 : map.hour;
    const wallClockFromGuess = Date.UTC(map.year, map.month - 1, map.day, formattedHour, map.minute, map.second);
    const diff = targetWallClockUtc - wallClockFromGuess;
    if (diff === 0) break;
    utcGuess += diff;
  }

  const startDate = new Date(utcGuess);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  return {
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
  };
}

