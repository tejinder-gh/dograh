import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSafeOutboundUrl,
  safeFetch,
  isPrivateOrRestrictedIp,
  registerSafeHostForTesting,
  clearSafeHostsForTesting,
  SsrfSecurityError,
} from '../../utils/ssrf-guard';
import {
  claimApprovalForExecution,
  finalizeApprovalExecution,
  createApprovalRequest,
  reserveIdempotentExecution,
} from '../../db/repositories/marketplace-execution.repository';
import { ToolExecutionGateway, ToolExecutionGatewayError } from '../tool-execution-gateway.service';
import { CalendarConnector } from '../connectors/calendar-connector';
import { setTestQueryHandler } from '../../db/connection';
import { SecretVault } from '../secret-vault.service';

// ============================================================================
// 1. SSRF GUARD & EGRESS SECURITY TESTS
// ============================================================================

test('SSRF Guard: isPrivateOrRestrictedIp identifies restricted IPv4 and IPv6 CIDRs', () => {
  // Loopback
  assert.equal(isPrivateOrRestrictedIp('127.0.0.1'), true);
  assert.equal(isPrivateOrRestrictedIp('127.0.0.2'), true);
  assert.equal(isPrivateOrRestrictedIp('::1'), true);

  // Cloud metadata & Link-local
  assert.equal(isPrivateOrRestrictedIp('169.254.169.254'), true);
  assert.equal(isPrivateOrRestrictedIp('169.254.1.1'), true);
  assert.equal(isPrivateOrRestrictedIp('fe80::1'), true);

  // Private RFC 1918
  assert.equal(isPrivateOrRestrictedIp('10.0.0.1'), true);
  assert.equal(isPrivateOrRestrictedIp('10.255.255.255'), true);
  assert.equal(isPrivateOrRestrictedIp('172.16.0.1'), true);
  assert.equal(isPrivateOrRestrictedIp('172.31.255.255'), true);
  assert.equal(isPrivateOrRestrictedIp('192.168.0.1'), true);
  assert.equal(isPrivateOrRestrictedIp('192.168.1.100'), true);

  // IPv4-mapped IPv6
  assert.equal(isPrivateOrRestrictedIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrRestrictedIp('::ffff:169.254.169.254'), true);

  // Public routable IPs (e.g. Cloudflare DNS, Google DNS, Example)
  assert.equal(isPrivateOrRestrictedIp('1.1.1.1'), false);
  assert.equal(isPrivateOrRestrictedIp('8.8.8.8'), false);
  assert.equal(isPrivateOrRestrictedIp('93.184.215.14'), false);
});

test('SSRF Guard: validateSafeOutboundUrl rejects non-HTTPS, cloud metadata, and private IP destinations', async () => {
  // Non-HTTPS
  await assert.rejects(
    () => validateSafeOutboundUrl('http://api.stripe.com/v1'),
    (err: unknown) => err instanceof SsrfSecurityError && err.code === 'PROTOCOL_INSECURE'
  );

  await assert.rejects(
    () => validateSafeOutboundUrl('file:///etc/passwd'),
    (err: unknown) => err instanceof SsrfSecurityError && err.code === 'PROTOCOL_INSECURE'
  );

  // Cloud metadata endpoint
  await assert.rejects(
    () => validateSafeOutboundUrl('https://169.254.169.254/latest/meta-data/'),
    (err: unknown) => err instanceof SsrfSecurityError && err.code === 'RESTRICTED_IP'
  );

  // Loopback IP
  await assert.rejects(
    () => validateSafeOutboundUrl('https://127.0.0.1:8443/admin'),
    (err: unknown) => err instanceof SsrfSecurityError && err.code === 'RESTRICTED_IP'
  );

  // Private RFC 1918
  await assert.rejects(
    () => validateSafeOutboundUrl('https://10.0.0.5/api'),
    (err: unknown) => err instanceof SsrfSecurityError && err.code === 'RESTRICTED_IP'
  );

  // Credentials in URL authority
  await assert.rejects(
    () => validateSafeOutboundUrl('https://admin:secret@api.vendor.com/v1'),
    (err: unknown) => err instanceof SsrfSecurityError && err.code === 'CREDENTIALS_IN_URL'
  );
});

test('SSRF Guard: DNS rebinding blocks hostnames resolving to private IP addresses', async () => {
  registerSafeHostForTesting('rebind.attacker-domain.com', ['169.254.169.254']);
  try {
    await assert.rejects(
      () => validateSafeOutboundUrl('https://rebind.attacker-domain.com/exfil'),
      (err: unknown) => err instanceof SsrfSecurityError && err.code === 'DNS_REBINDING_OR_RESTRICTED_IP'
    );
  } finally {
    clearSafeHostsForTesting();
  }
});

test('SSRF Guard: safeFetch blocks redirect to cloud metadata and enforces response size limits', async () => {
  const originalFetch = globalThis.fetch;
  registerSafeHostForTesting('safe-hop.vendor.com', ['93.184.215.14']);
  registerSafeHostForTesting('rebound-target.internal', ['127.0.0.1']);

  try {
    // 1. Redirect to restricted IP
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('safe-hop.vendor.com')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://169.254.169.254/latest/meta-data/' },
        });
      }
      return new Response('OK', { status: 200 });
    };

    await assert.rejects(
      () => safeFetch('https://safe-hop.vendor.com/start'),
      (err: unknown) => err instanceof SsrfSecurityError && err.code === 'RESTRICTED_IP'
    );

    // 2. Response size limit exceeded
    globalThis.fetch = async (): Promise<Response> => {
      return new Response('Large Payload', {
        status: 200,
        headers: { 'Content-Length': '10485760' }, // 10MB
      });
    };

    await assert.rejects(
      () => safeFetch('https://safe-hop.vendor.com/huge', {}, { maxBytes: 1024 * 1024 }),
      (err: unknown) => err instanceof SsrfSecurityError && err.code === 'RESPONSE_TOO_LARGE'
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearSafeHostsForTesting();
  }
});

test('SSRF Guard: DNS rebinding between validation and connection is blocked at socket layer', async () => {
  // First, host resolves to public IP during validation
  registerSafeHostForTesting('attacker-rebind.com', ['93.184.215.14']);

  try {
    const res = await validateSafeOutboundUrl('https://attacker-rebind.com/webhook');
    assert.ok(res.resolvedIps.includes('93.184.215.14'));

    // Rebind host to 169.254.169.254 right when socket lookup occurs
    registerSafeHostForTesting('attacker-rebind.com', ['169.254.169.254']);

    // safeFetch socket layer must catch the rebinding and abort connection
    await assert.rejects(
      () => safeFetch('https://attacker-rebind.com/webhook', {}, { forcePinnedSocket: true }),
      (err: unknown) =>
        err instanceof SsrfSecurityError &&
        (err.code === 'DNS_REBINDING_OR_RESTRICTED_IP' || err.code === 'RESTRICTED_IP')
    );
  } finally {
    clearSafeHostsForTesting();
  }
});

test('SSRF Guard: safeFetch rejects cross-origin redirect when Authorization header is present', async () => {
  const originalFetch = globalThis.fetch;
  registerSafeHostForTesting('public-service-a.com', ['93.184.215.14']);
  registerSafeHostForTesting('public-service-b.com', ['93.184.215.15']);

  try {
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('public-service-a.com')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://public-service-b.com/callback' },
        });
      }
      return new Response('OK', { status: 200 });
    };

    await assert.rejects(
      () =>
        safeFetch('https://public-service-a.com/data', {
          headers: {
            Authorization: 'Bearer sensitive_crm_oauth_token',
          },
        }),
      (err: unknown) =>
        err instanceof SsrfSecurityError &&
        err.code === 'CROSS_ORIGIN_REDIRECT_CREDENTIAL_LEAK'
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearSafeHostsForTesting();
  }
});

test('SSRF Guard: safeFetch enforces maxBytes limit on chunked streaming responses without Content-Length', async () => {
  const originalFetch = globalThis.fetch;
  registerSafeHostForTesting('stream.vendor.com', ['93.184.215.14']);

  try {
    globalThis.fetch = async (): Promise<Response> => {
      // Chunked infinite stream without Content-Length header
      let chunksSent = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (chunksSent < 50) {
            chunksSent++;
            controller.enqueue(new Uint8Array(64 * 1024)); // 64KB chunks
          } else {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        // Intentionally no Content-Length header
      });
    };

    await assert.rejects(
      () => safeFetch('https://stream.vendor.com/events', {}, { maxBytes: 128 * 1024 }), // 128KB max
      (err: unknown) =>
        err instanceof SsrfSecurityError && err.code === 'RESPONSE_TOO_LARGE'
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearSafeHostsForTesting();
  }
});

// ============================================================================
// 2. AGENT IMPERSONATION & OPERATION-SCOPED RBAC TESTS
// ============================================================================

test('ToolExecutionGateway rejects unprivileged tenant_staff invoking write tools via assigned agentId', async () => {
  setTestQueryHandler(async (sql) => {
    if (sql.includes('FROM tool_capabilities')) {
      return {
        rows: [
          {
            cap_id: 'cap-write-1',
            cap_tool_version_id: 'ver-1',
            cap_function_name: 'send_sms_notification',
            cap_display_name: 'Send SMS',
            cap_operation_type: 'write',
            cap_risk_level: 'standard_write',
            cap_requires_approval: false,
            cap_input_schema: { type: 'object', required: ['to', 'message'], properties: { to: { type: 'string' }, message: { type: 'string' } } },
            tool_id: 'tool-comm-1',
            tool_name: 'Twilio Telephony',
            tool_category: 'communication',
            tool_provider: 'twilio',
            tool_is_verified: true,
            tool_is_active: true,
            tool_min_plan_tier: 'starter',
            inst_id: 'inst-1',
            inst_tenant_id: 'tenant-100',
            inst_tool_id: 'tool-comm-1',
            inst_tool_version_id: 'ver-1',
            inst_status: 'active',
            assign_id: 'assign-1',
            assign_agent_id: 'agent-sales-1',
            assign_is_enabled: true,
            assign_allowed_capabilities: ['send_sms_notification'],
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    return null;
  });

  try {
    // Unprivileged user passes valid agentId trying to perform write tool execution
    const res1 = await ToolExecutionGateway.executeTool({
      tenantId: 'tenant-100',
      agentId: 'agent-sales-1',
      sessionId: 's-test-1',
      capabilityName: 'send_sms_notification',
      arguments: { to: '+15551234567', message: 'Hello' },
      userRole: 'tenant_staff', // Unprivileged staff
    });

    assert.equal(res1.success, false);
    assert.equal(res1.errorCode, 'PERMISSION_DENIED');
    assert.match(String(res1.error), /requires manager or administrator privileges/);

    // Analyst role trying to execute consequential tool
    const res2 = await ToolExecutionGateway.executeTool({
      tenantId: 'tenant-100',
      agentId: 'agent-sales-1',
      sessionId: 's-test-2',
      capabilityName: 'send_sms_notification',
      arguments: { to: '+15551234567', message: 'Hello' },
      userRole: 'analyst', // Read-only analyst
    });

    assert.equal(res2.success, false);
    assert.equal(res2.errorCode, 'PERMISSION_DENIED');
  } finally {
    setTestQueryHandler(null);
  }
});

// ============================================================================
// 3. APPROVAL ATOMIC CLAIMING & CONCURRENCY TESTS
// ============================================================================

test('claimApprovalForExecution: atomically claims approved request and rejects concurrent duplicate claims', async () => {
  let approvalStatus = 'approved';
  let claimedCount = 0;

  setTestQueryHandler(async (sql, params) => {
    if (sql.includes('UPDATE tool_approval_requests') && sql.includes("SET status = 'executing'")) {
      if (approvalStatus === 'approved') {
        approvalStatus = 'executing';
        claimedCount++;
        return {
          rows: [
            {
              id: params?.[1] || 'app-1',
              tenantId: params?.[0] || 'tenant-100',
              sessionId: 'session-1',
              toolName: 'Stripe Payments',
              capabilityName: 'create_payment_link',
              sanitizedArguments: { amountCents: 5000 },
              status: 'executing',
              requestedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 60000).toISOString(),
            },
          ],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        };
      }
      return { rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] };
    }

    if (sql.includes('SELECT') && sql.includes('FROM tool_approval_requests')) {
      return {
        rows: [
          {
            id: 'app-1',
            tenantId: 'tenant-100',
            sessionId: 'session-1',
            toolName: 'Stripe Payments',
            capabilityName: 'create_payment_link',
            sanitizedArguments: { amountCents: 5000 },
            status: approvalStatus,
            requestedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            executionResult: approvalStatus === 'executed' ? { paymentId: 'pi_test' } : null,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    return null;
  });

  try {
    // First claim succeeds: approved -> executing
    const claim1 = await claimApprovalForExecution('tenant-100', 'app-1', 'admin-user-1');
    assert.equal(claim1.success, true);
    assert.equal(claim1.approval?.status, 'executing');
    assert.equal(claimedCount, 1);

    // Concurrent second claim receives conflict: already_executing
    const claim2 = await claimApprovalForExecution('tenant-100', 'app-1', 'admin-user-2');
    assert.equal(claim2.success, false);
    assert.equal(claim2.conflictReason, 'already_executing');
    assert.equal(claimedCount, 1); // Only 1 winner

    // Finalize as executed
    approvalStatus = 'executed';

    // Third claim receives alreadyExecuted = true (idempotent result)
    const claim3 = await claimApprovalForExecution('tenant-100', 'app-1', 'admin-user-3');
    assert.equal(claim3.success, false);
    assert.equal(claim3.alreadyExecuted, true);
  } finally {
    setTestQueryHandler(null);
  }
});

// ============================================================================
// 4. CALENDAR CONNECTOR INTERVAL OVERLAP & PERSISTENCE ROLLBACK TESTS
// ============================================================================

test('CalendarConnector: detects interval overlap across appointment duration', async () => {
  const connector = new CalendarConnector();
  const originalFetch = globalThis.fetch;

  try {
    // Mock Google Calendar freeBusy with busy window 10:00 to 11:00 UTC
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/freeBusy')) {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    // 10:00 AM EDT (UTC-4) corresponds to 14:00:00Z in Google Calendar freeBusy
                    start: '2026-10-25T14:00:00Z',
                    end: '2026-10-25T15:00:00Z',
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('OK', { status: 200 });
    };

    const res = await connector.execute({
      tenantId: 'tenant-100',
      sessionId: 's-cal-1',
      capabilityName: 'check_calendar_availability',
      arguments: { date: '2026-10-25', durationMinutes: 60 },
      decryptedCredentials: { accessToken: 'ya29.mock_token' },
      customSettings: { timeZone: 'America/New_York', calendarId: 'primary' },
    });

    assert.equal(res.timeZone, 'America/New_York');
    assert.equal(res.calendarId, 'primary');
    // 10:00 AM slot must be filtered out due to busy overlap
    const availableSlots = (res as any).availableSlots as string[];
    assert.ok(!availableSlots.includes('10:00 AM'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CalendarConnector: rolls back external Google Calendar event when local Neon booking persistence fails', async () => {
  const connector = new CalendarConnector();
  const originalFetch = globalThis.fetch;
  let deletedEventId: string | null = null;

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);

      if (url.includes('/freeBusy')) {
        return new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), { status: 200 });
      }

      if (url.includes('/events') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ id: 'gcal-event-999', htmlLink: 'https://calendar.google.com/event-999' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/events/gcal-event-999') && init?.method === 'DELETE') {
        deletedEventId = 'gcal-event-999';
        return new Response(null, { status: 204 });
      }

      return new Response('OK', { status: 200 });
    };

    // Force DB confirmBooking failure after external event creation
    setTestQueryHandler(async (sql) => {
      if (sql.includes('UPDATE scheduled_sessions') && sql.includes("status = 'confirmed'")) {
        throw new Error('Neon DB transaction failure: connection closed');
      }
      if (sql.includes('INSERT INTO contacts')) {
        return { rows: [{ id: 'contact-mock-1' }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }
      if (sql.includes('FROM representatives')) {
        return {
          rows: [{ id: 'rep-mock-1', name: 'Rep 1', role: 'Advisor', email: 'rep@test.com' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        };
      }
      if (sql.includes('FOR UPDATE')) {
        return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
      }
      if (sql.includes('INSERT INTO scheduled_sessions')) {
        return {
          rows: [
            {
              id: 'session-hold-1',
              tenant_id: 'tenant-100',
              contact_id: 'contact-mock-1',
              date: '2026-10-25',
              time_slot: '09:00 AM',
              duration_minutes: 60,
              status: 'pending_confirmation',
            },
          ],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        };
      }
      if (sql.includes('SELECT s.*')) {
        return {
          rows: [
            {
              id: 'session-hold-1',
              tenant_id: 'tenant-100',
              contact_id: 'contact-mock-1',
              date: '2026-10-25',
              time_slot: '09:00 AM',
              duration_minutes: 60,
              status: 'pending_confirmation',
            },
          ],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        };
      }
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    });

    await assert.rejects(
      () =>
        connector.execute({
          tenantId: 'tenant-100',
          sessionId: 's-cal-fail',
          capabilityName: 'book_calendar_appointment',
          arguments: { date: '2026-10-25', timeSlot: '09:00 AM', durationMinutes: 60 },
          decryptedCredentials: { accessToken: 'ya29.mock_token' },
        }),
      /Booking persistence failed; calendar hold was rolled back/
    );

    // Verify Google Calendar event was rolled back via DELETE
    assert.equal(deletedEventId, 'gcal-event-999');
  } finally {
    globalThis.fetch = originalFetch;
    setTestQueryHandler(null);
  }
});

// ============================================================================
// 5. TOOL VERSION PINNING TESTS
// ============================================================================

test('ToolExecutionGateway: enforces installed tool version pinning in query', async () => {
  let executedSql = '';

  setTestQueryHandler(async (sql) => {
    if (sql.includes('FROM tool_capabilities c')) {
      executedSql = sql;
      return {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    return null;
  });

  try {
    const res = await ToolExecutionGateway.executeTool({
      tenantId: 'tenant-100',
      sessionId: 's-ver-1',
      capabilityName: 'non_existent_capability',
      arguments: {},
    });

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'TOOL_NOT_FOUND');

    // Assert that the join explicitly pinned installed tool version
    assert.ok(
      executedSql.includes('i.tool_version_id = v.id'),
      'SQL must join on i.tool_version_id = v.id to prevent cross-version capability dispatch'
    );
  } finally {
    setTestQueryHandler(null);
  }
});

// ============================================================================
// 6. FAIL-CLOSED APPROVAL DECRYPTION & DB-BACKED IDEMPOTENCY
// ============================================================================

test('claimApprovalForExecution: fails closed and resets claim when payload decryption fails', async () => {
  let approvalStatus = 'approved';

  setTestQueryHandler(async (sql, params) => {
    if (sql.includes('UPDATE tool_approval_requests') && sql.includes("SET status = 'executing'")) {
      approvalStatus = 'executing';
      return {
        rows: [
          {
            id: 'app-fail-decrypt',
            tenantId: 'tenant-100',
            sessionId: 'session-1',
            toolName: 'Stripe Payments',
            capabilityName: 'create_payment_link',
            sanitizedArguments: { amountCents: '••••••••' },
            encryptedPayload: 'tampered:iv:authTag:corruptedCiphertext',
            status: 'executing',
            requestedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        ],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      };
    }

    if (sql.includes('UPDATE tool_approval_requests') && sql.includes("SET status = 'approved'")) {
      // Reverted back to approved
      approvalStatus = 'approved';
      return { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
    }

    return null;
  });

  try {
    const claimResult = await claimApprovalForExecution('tenant-100', 'app-fail-decrypt', 'admin-1');
    assert.equal(claimResult.success, false);
    assert.equal(claimResult.conflictReason, 'decryption_failed');
    // Ensure status was reverted back to 'approved' for recovery
    assert.equal(approvalStatus, 'approved');
  } finally {
    setTestQueryHandler(null);
  }
});

test('ToolExecutionGateway: atomic DB-backed idempotency prevents duplicate execution', async () => {
  let existingLogStatus: string | null = null;
  let cachedOutput: Record<string, unknown> | null = null;

  setTestQueryHandler(async (sql, params) => {
    if (sql.includes('INSERT INTO tool_execution_logs') && sql.includes('ON CONFLICT (tenant_id, idempotency_key) DO NOTHING')) {
      if (existingLogStatus === null) {
        existingLogStatus = 'executing';
        return { rows: [{ id: 'log-1' }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }
      // Conflict
      return { rows: [], rowCount: 0, command: 'INSERT', oid: 0, fields: [] };
    }

    if (sql.includes('SELECT') && sql.includes('FROM tool_execution_logs') && sql.includes('idempotency_key = $2')) {
      return {
        rows: [
          {
            id: 'log-1',
            status: existingLogStatus,
            sanitizedOutput: cachedOutput,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }

    return null;
  });

  try {
    // 1. Initial reservation succeeds
    const res1 = await reserveIdempotentExecution({
      tenantId: 'tenant-100',
      sessionId: 's-1',
      toolName: 'Stripe Payments',
      capabilityName: 'create_payment_link',
      executionSource: 'test_runner',
      input: { amountCents: 5000 },
      idempotencyKey: 'idem-key-unique-1',
    });
    assert.equal(res1.isNew, true);

    // 2. Duplicate reservation while executing yields conflict
    const res2 = await reserveIdempotentExecution({
      tenantId: 'tenant-100',
      sessionId: 's-1',
      toolName: 'Stripe Payments',
      capabilityName: 'create_payment_link',
      executionSource: 'test_runner',
      input: { amountCents: 5000 },
      idempotencyKey: 'idem-key-unique-1',
    });
    assert.equal(res2.isNew, false);
    assert.equal(res2.status, 'executing');
  } finally {
    setTestQueryHandler(null);
  }
});

