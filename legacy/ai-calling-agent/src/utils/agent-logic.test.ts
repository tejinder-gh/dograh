import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSentimentCategory,
  evaluateEscalationStatus,
  calculateLeadQualification,
  formatCallDuration,
  parseBookingIntent,
  parseCsvContent,
  smartMapCsvHeaders,
  buildGoogleCalendarDescription
} from './agent-logic.ts';

test('getSentimentCategory categorizes ranges properly', () => {
  assert.equal(getSentimentCategory(80), 'positive');
  assert.equal(getSentimentCategory(20), 'neutral');
  assert.equal(getSentimentCategory(-20), 'frustrated');
  assert.equal(getSentimentCategory(-65), 'critical');
});

test('evaluateEscalationStatus flags critical keywords', () => {
  const result = evaluateEscalationStatus(10, 'I demand to talk to a manager immediately');
  assert.equal(result.isEscalated, true);
  assert.equal(result.urgencyLevel, 'critical');
  assert.match(result.reason || '', /manager/i);
});

test('evaluateEscalationStatus triggers on distress threshold', () => {
  const result = evaluateEscalationStatus(-60, 'This product is causing problems for my team');
  assert.equal(result.isEscalated, true);
  assert.equal(result.urgencyLevel, 'critical');
});

test('evaluateEscalationStatus flags consecutive negative sentiments', () => {
  const normal = evaluateEscalationStatus(-30, 'I am still annoyed', 1);
  assert.equal(normal.isEscalated, false);

  const escalated = evaluateEscalationStatus(-30, 'This is still not resolved', 2);
  assert.equal(escalated.isEscalated, true);
  assert.equal(escalated.urgencyLevel, 'high');
});

test('calculateLeadQualification calculates enterprise tier BANT score correctly', () => {
  const qualified = calculateLeadQualification({
    budgetMentioned: true,
    authorityLevel: 'decision_maker',
    needUrgency: 'immediate',
    timelineWeeks: 3
  });
  assert.equal(qualified.leadScore, 100);
  assert.equal(qualified.isQualified, true);
  assert.equal(qualified.tier, 'enterprise');
});

test('calculateLeadQualification handles non-qualified casual lead', () => {
  const casual = calculateLeadQualification({
    budgetMentioned: false,
    authorityLevel: 'individual',
    needUrgency: 'casual',
    timelineWeeks: 20
  });
  assert.equal(casual.leadScore, 20);
  assert.equal(casual.isQualified, false);
  assert.equal(casual.tier, 'standard');
});

test('formatCallDuration formats seconds into clock display', () => {
  assert.equal(formatCallDuration(0), '00:00');
  assert.equal(formatCallDuration(45), '00:45');
  assert.equal(formatCallDuration(125), '02:05');
  assert.equal(formatCallDuration(3665), '01:01:05');
});

test('parseBookingIntent correctly identifies session scheduling requests', () => {
  assert.equal(parseBookingIntent('Can I book a session with an expert?').hasBookingIntent, true);
  assert.equal(parseBookingIntent('I would like to schedule a call for pricing').hasBookingIntent, true);
  assert.equal(parseBookingIntent('What are your operating hours?').hasBookingIntent, false);
});

test('parseCsvContent parses lines and headers accurately', () => {
  const csv = `Full Name, customer female, Phone Number, Organization\nAlice Walker, alice@tech.io, +15551234, Apex Global\nBob Vance, bob@vance.com, +15555678, Vance Refrig`;
  const parsed = parseCsvContent(csv);
  assert.equal(parsed.headers.length, 4);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]['customer female'], 'alice@tech.io');
});

test('smartMapCsvHeaders handles non-standard headers and user typos', () => {
  const headers = ['Full Name', 'customer female', 'cell_number', 'biz_name', 'deal_budget'];
  const mapped = smartMapCsvHeaders(headers);
  assert.equal(mapped['Full Name'], 'name');
  assert.equal(mapped['customer female'], 'email'); // user's explicit typo example!
  assert.equal(mapped['cell_number'], 'phone');
  assert.equal(mapped['biz_name'], 'company');
  assert.equal(mapped['deal_budget'], 'estimatedValue');
});

test('buildGoogleCalendarDescription formats comprehensive attraction summary', () => {
  const desc = buildGoogleCalendarDescription({
    leadName: 'David Vance',
    company: 'CloudScale Dynamics',
    email: 'd.vance@cloudscale.io',
    phone: '+1 (415) 890-4321',
    repName: 'Marcus Chen',
    repRole: 'Lead Solutions Architect',
    meetingGoal: 'Inbound VIP Discovery & Technical Review',
    transcriptSummary: 'Caller verified 250k monthly call volume and sub-second voice latency requirements.',
    bantScore: 92,
    calendarLink: 'https://calendar.google.com/event?id=123'
  });

  assert.match(desc, /PROSPECT & COMPANY PROFILE/);
  assert.match(desc, /David Vance/);
  assert.match(desc, /CloudScale Dynamics/);
  assert.match(desc, /Marcus Chen/);
  assert.match(desc, /BANT Qualification Score: 92\/100/);
  assert.match(desc, /Caller verified 250k/);
});

