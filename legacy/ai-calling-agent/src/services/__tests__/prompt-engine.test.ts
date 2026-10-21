import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePrompt,
  GLOBAL_SAFETY_POLICY,
  PLATFORM_MASTER_PROMPT
} from '../prompt-engine';

test('GLOBAL_SAFETY_POLICY enforces accuracy, latency, and compliance restrictions', () => {
  assert.match(GLOBAL_SAFETY_POLICY, /MANDATORY SAFETY & GROUNDING GUARDRAILS/);
  assert.match(GLOBAL_SAFETY_POLICY, /Do NOT manufacture or guarantee response latencies/);
  assert.match(GLOBAL_SAFETY_POLICY, /Do NOT claim regulatory certifications/);
  assert.match(GLOBAL_SAFETY_POLICY, /CONVERSATIONAL ESCALATION/);
});

test('resolvePrompt includes immutable safety guardrails in all resolutions', async () => {
  const resolved = await resolvePrompt({
    tenantId: 'tenant-test-123',
    channel: 'call_inbound',
  });

  assert.ok(resolved.composedPrompt.includes('MANDATORY SAFETY & GROUNDING GUARDRAILS'));
  assert.ok(resolved.activeLayers.includes('global_safety_policy'));
});

test('resolvePrompt incorporates industry templates when specified', async () => {
  const resolved = await resolvePrompt({
    tenantId: 'tenant-test-123',
    industry: 'healthcare',
    channel: 'call_inbound',
  });

  assert.ok(resolved.composedPrompt.includes('HEALTHCARE'));
  assert.ok(resolved.activeLayers.includes('industry_template'));
});

test('resolvePrompt integrates campaign goals and calendar scheduling links', async () => {
  const resolved = await resolvePrompt({
    tenantId: 'tenant-test-123',
    channel: 'call_outbound',
    campaignGoal: 'Qualify enterprise telephony buyers and book VIP architecture reviews',
    calendarLink: 'https://calendar.google.com/event?id=vip-99',
  });

  assert.ok(resolved.composedPrompt.includes('ACTIVE CAMPAIGN OBJECTIVE'));
  assert.ok(resolved.composedPrompt.includes('VIP architecture reviews'));
  assert.ok(resolved.composedPrompt.includes('https://calendar.google.com/event?id=vip-99'));
  assert.ok(resolved.activeLayers.includes('campaign_goal'));
  assert.ok(resolved.activeLayers.includes('calendar_link'));
});

test('resolvePrompt injects verified RAG evidence and strictly forbids external hallucinations', async () => {
  const resolved = await resolvePrompt({
    tenantId: 'tenant-test-123',
    channel: 'call_inbound',
    verifiedRagSnippets: [
      'Clinic hours are Monday through Friday, 8am to 5pm.',
      'Dr. Reed is accepting new patient referrals.',
    ],
  });

  assert.ok(resolved.composedPrompt.includes('VERIFIED BUSINESS FACTS & APPROVED KNOWLEDGE'));
  assert.ok(resolved.composedPrompt.includes('Clinic hours are Monday through Friday'));
  assert.ok(resolved.composedPrompt.includes('Rely strictly on these verified facts'));
  assert.ok(resolved.activeLayers.includes('rag_evidence'));
});

test('resolvePrompt marks raw tenant notes as unverified context rather than verified facts', async () => {
  const resolved = await resolvePrompt({
    tenantId: 'tenant-test-123',
    channel: 'call_inbound',
    unverifiedNotes: [
      'Preliminary pricing might drop next quarter pending board sign-off.',
      'Caller mentioned they might expand to 50 seats.',
    ],
  });

  assert.ok(resolved.composedPrompt.includes('TENANT CONTEXT GUIDANCE (Unverified Profile Notes)'));
  assert.ok(resolved.composedPrompt.includes('Preliminary pricing might drop next quarter'));
  assert.ok(resolved.composedPrompt.includes('must NOT be stated to callers as binding commitments'));
  assert.ok(resolved.activeLayers.includes('unverified_context_notes'));
  assert.equal(resolved.activeLayers.includes('rag_evidence'), false, 'Unverified notes must not be tagged as rag_evidence');
});
