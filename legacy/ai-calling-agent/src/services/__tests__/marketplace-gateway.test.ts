import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SecretVault,
  SecretVaultConfigurationError,
  registerKey,
  clearKeyRegistry,
  setMasterKeyForTesting,
} from '../secret-vault.service';
import { EntitlementService, EntitlementError } from '../entitlement.service';
import { ToolExecutionGateway, ToolExecutionGatewayError } from '../tool-execution-gateway.service';
import { VoiceToolGate } from '../../voice/tool-gate';
import {
  CalendarConnector,
  CrmConnector,
  TelephonyConnector,
  PaymentConnector,
  McpConnector,
  InternalToolsConnector,
} from '../connectors';
import { registerSafeHostForTesting, clearSafeHostsForTesting } from '../../utils/ssrf-guard';

// ============================================================================
// 1. SECRET VAULT & KEY ROTATION TESTS
// ============================================================================

test('SecretVault encrypts and decrypts provider credentials with AES-256-GCM', () => {
  const secret = 'sk_live_enterprise_api_key_secure_987654321';
  const encrypted = SecretVault.encrypt(secret, 'neon-prod-v1');

  assert.ok(encrypted.cipherText.startsWith('aes256gcm:'));
  assert.equal(encrypted.keyRef, 'neon-prod-v1');
  assert.notEqual(encrypted.cipherText, secret);

  const decrypted = SecretVault.decrypt(encrypted.cipherText);
  assert.equal(decrypted, secret);
});

test('SecretVault throws error on tampered ciphertext', () => {
  const secret = 'super-secret-token';
  const encrypted = SecretVault.encrypt(secret);
  const tampered = encrypted.cipherText.slice(0, -4) + 'ffff';

  assert.throws(
    () => SecretVault.decrypt(tampered),
    /corrupted|unrecognized|bad decrypt|unsupported state/i
  );
});

test('SecretVault fails closed in production when ENCRYPTION_MASTER_KEY is missing or weak', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.ENCRYPTION_MASTER_KEY;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ENCRYPTION_MASTER_KEY;
    setMasterKeyForTesting(null);
    clearKeyRegistry();

    assert.throws(
      () => SecretVault.encrypt('sensitive-credential'),
      (err: unknown) => err instanceof SecretVaultConfigurationError
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalKey) {
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    }
    setMasterKeyForTesting(null);
  }
});

test('SecretVault supports multi-key registration and cryptographic key rotation', () => {
  clearKeyRegistry();
  const key1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const key2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
  registerKey('key-v1', key1);
  registerKey('key-v2', key2);

  const secret = 'super-confidential-stripe-key';
  const encryptedV1 = SecretVault.encrypt(secret, 'key-v1');
  assert.ok(encryptedV1.cipherText.includes('key-v1'));
  assert.equal(SecretVault.decrypt(encryptedV1.cipherText), secret);

  // Rotate to key-v2
  const rotated = SecretVault.rotate(encryptedV1.cipherText, 'key-v2');
  assert.equal(rotated.keyRef, 'key-v2');
  assert.ok(rotated.cipherText.includes('key-v2'));
  assert.equal(SecretVault.decrypt(rotated.cipherText), secret);

  clearKeyRegistry();
});

test('SecretVault masks sensitive strings and recursively sanitizes log objects', () => {
  const masked = SecretVault.maskCredential('sk_live_1234567890abcdef');
  assert.ok(masked.includes('...'));
  assert.ok(masked.endsWith('cdef'));

  const rawPayload = {
    contactId: 'c-101',
    apiKey: 'sk_live_very_secret_key_12345',
    nested: {
      password: 'mypassword123',
      normalField: 'public_data',
    },
    items: [{ secret_token: 'secret_abc' }, { safe: 42 }],
  };

  const sanitized = SecretVault.sanitizeForLogging(rawPayload) as any;
  assert.equal(sanitized.contactId, 'c-101');
  assert.ok(!sanitized.apiKey.includes('very_secret'));
  assert.ok(!sanitized.nested.password.includes('mypassword'));
  assert.equal(sanitized.nested.normalField, 'public_data');
  assert.equal(sanitized.items[1].safe, 42);
});

// ============================================================================
// 2. REFUSAL OF UNCONFIGURED PROVIDERS (FAIL-CLOSED INTEGRATION TESTS)
// ============================================================================

test('PaymentConnector fails closed when unconfigured and strictly calls real Stripe endpoint', async () => {
  const connector = new PaymentConnector();

  // 1. Missing credentials fails closed
  await assert.rejects(
    () =>
      connector.execute({
        tenantId: 'tenant-test',
        sessionId: 's-1',
        capabilityName: 'create_payment_link',
        arguments: { amountCents: 5000, description: 'Deposit' },
      }),
    /\[STRIPE PAYMENT BLOCKED\]/
  );

  // 2. Reject non-positive amounts
  await assert.rejects(
    () =>
      connector.execute({
        tenantId: 'tenant-test',
        sessionId: 's-2',
        capabilityName: 'create_payment_link',
        arguments: { amountCents: -500, description: 'Invalid' },
        decryptedCredentials: { secretKey: 'sk_test_valid_key_123' },
      }),
    /amountCents must be a positive integer/
  );

  // 3. Provider contract test with mocked fetch
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('api.stripe.com/v1/checkout/sessions')) {
        return new Response(
          JSON.stringify({
            id: 'cs_test_mocked_stripe_session_999',
            url: 'https://checkout.stripe.com/c/pay/cs_test_mocked_stripe_session_999',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const res = await connector.execute({
      tenantId: 'tenant-test',
      sessionId: 's-3',
      capabilityName: 'create_payment_link',
      arguments: { amountCents: 10000, description: 'Consultation Fee', customerEmail: 'test@example.com' },
      decryptedCredentials: { secretKey: 'sk_test_valid_key_123' },
    });

    assert.equal(res.success, true);
    assert.equal(res.paymentId, 'cs_test_mocked_stripe_session_999');
    assert.ok(String(res.checkoutUrl).includes('checkout.stripe.com'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TelephonyConnector fails closed when unconfigured and strictly calls real Twilio API', async () => {
  const connector = new TelephonyConnector();

  // 1. Missing credentials fails closed
  await assert.rejects(
    () =>
      connector.execute({
        tenantId: 'tenant-test',
        sessionId: 's-4',
        capabilityName: 'send_sms_message',
        arguments: { to: '+15551234567', message: 'Appointment reminder' },
      }),
    /\[TWILIO BLOCKED\]/
  );

  // 2. Invalid Account SID format rejected during connection test
  const invalidSidTest = await connector.testConnection({
    accountSid: 'invalid_sid_short',
    authToken: 'valid_auth_token_123456',
  });
  assert.equal(invalidSidTest.success, false);
  assert.ok(invalidSidTest.message.includes('Invalid Twilio Account SID format'));

  // 3. Provider contract test with mocked fetch
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('api.twilio.com')) {
        return new Response(
          JSON.stringify({
            sid: 'SM_mocked_twilio_message_sid_777',
            status: 'queued',
            num_segments: '1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const res = await connector.execute({
      tenantId: 'tenant-test',
      sessionId: 's-5',
      capabilityName: 'send_sms_message',
      arguments: { to: '+15551234567', message: 'Consultation confirmed' },
      decryptedCredentials: {
        accountSid: 'AC_TEST_ACCOUNT_SID_00000000000000',
        authToken: 'secret_token_12345678',
        fromPhoneNumber: '+15550001111',
      },
    });

    assert.equal(res.success, true);
    assert.equal(res.messageSid, 'SM_mocked_twilio_message_sid_777');
    assert.equal(res.status, 'queued');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CalendarConnector fails closed when unconfigured and strictly queries Google Calendar API', async () => {
  const connector = new CalendarConnector();

  // 1. Missing credentials fails closed
  await assert.rejects(
    () =>
      connector.execute({
        tenantId: 'tenant-test',
        sessionId: 's-6',
        capabilityName: 'check_calendar_availability',
        arguments: { date: '2026-11-01' },
      }),
    /\[GOOGLE CALENDAR BLOCKED\]/
  );

  // 2. Provider contract test with mocked Google Calendar freeBusy response
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('googleapis.com/calendar/v3/freeBusy')) {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  { start: '2026-11-01T19:00:00Z', end: '2026-11-01T20:00:00Z' }, // 02:00 PM EST (UTC-5)
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const res = await connector.execute({
      tenantId: 'tenant-test',
      sessionId: 's-7',
      capabilityName: 'check_calendar_availability',
      arguments: { date: '2026-11-01' },
      decryptedCredentials: { accessToken: 'ya29.mock_google_oauth_token' },
    });

    assert.equal(res.date, '2026-11-01');
    assert.equal(res.source, 'google_workspace_calendar_api');
    const available = res.availableSlots as string[];
    // Busy slot (02:00 PM) must be filtered out
    assert.ok(!available.includes('02:00 PM'));
    assert.ok(available.includes('09:00 AM'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CrmConnector fails closed when unconfigured and strictly contacts Salesforce API without synthetic BANT data', async () => {
  const connector = new CrmConnector();

  // 1. Missing credentials fails closed
  await assert.rejects(
    () =>
      connector.execute({
        tenantId: 'tenant-test',
        sessionId: 's-8',
        capabilityName: 'lookup_contact_crm',
        arguments: { email: 'lead@example.com' },
      }),
    /\[SALESFORCE CRM BLOCKED\]/
  );

  // 2. Provider contract test with mocked Salesforce SOQL query
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/services/data/v58.0/query')) {
        return new Response(
          JSON.stringify({
            totalSize: 1,
            records: [
              {
                Id: '003_sf_contact_id_555',
                Name: 'Jane Executive',
                Email: 'jane@enterprise.com',
                Phone: '+15559998888',
                Title: 'VP of Technology',
                LeadSource: 'AI Inbound Voice Call',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const res = await connector.execute({
      tenantId: 'tenant-test',
      sessionId: 's-9',
      capabilityName: 'lookup_contact_crm',
      arguments: { email: 'jane@enterprise.com' },
      decryptedCredentials: {
        instanceUrl: 'https://na123.salesforce.com',
        accessToken: 'mock_salesforce_session_token',
      },
    });

    assert.equal(res.found, true);
    const contact = res.contact as any;
    assert.equal(contact.id, '003_sf_contact_id_555');
    assert.equal(contact.name, 'Jane Executive');
    assert.equal(contact.title, 'VP of Technology');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('McpConnector fails closed when unconfigured and enforces real JSON-RPC protocol', async () => {
  const connector = new McpConnector();

  // Missing endpoint fails closed
  await assert.rejects(
    () =>
      connector.execute({
        tenantId: 'tenant-test',
        sessionId: 's-10',
        capabilityName: 'mcp_query_inventory_catalog',
        arguments: { productCode: 'PRD-101' },
      }),
    /\[MCP BLOCKED\]/
  );

  // Mocked JSON-RPC response
  const originalFetch = globalThis.fetch;
  registerSafeHostForTesting('mcp.internal.infra', ['93.184.215.14']);
  try {
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.jsonrpc, '2.0');
      assert.equal(body.method, 'tools/call');

      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ inStock: true, units: 142 }) }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await connector.execute({
      tenantId: 'tenant-test',
      sessionId: 's-11',
      capabilityName: 'mcp_query_inventory_catalog',
      arguments: { productCode: 'PRD-101' },
      decryptedCredentials: { endpointUrl: 'https://mcp.internal.infra/rpc' },
    });

    assert.equal(res.success, true);
    assert.equal((res as any).inStock, true);
  } finally {
    globalThis.fetch = originalFetch;
    clearSafeHostsForTesting();
  }
});

// ============================================================================
// 3. STRICT JSON SCHEMA VALIDATION TESTS
// ============================================================================

test('ToolExecutionGateway validateArguments enforces strict types, enum, bounds, and rejects unexpected properties', () => {
  const strictSchema = {
    type: 'object',
    required: ['to', 'amountCents', 'priority'],
    additionalProperties: false,
    properties: {
      to: { type: 'string', minLength: 5, maxLength: 20 },
      amountCents: { type: 'integer', minimum: 100, maximum: 100000 },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      isActive: { type: 'boolean' },
      tags: { type: 'array' },
      metadata: { type: 'object' },
    },
  };

  // 1. Missing required field
  assert.throws(
    () => ToolExecutionGateway.validateArguments({ to: '+1555123' }, strictSchema),
    (err: unknown) => err instanceof ToolExecutionGatewayError && err.code === 'SCHEMA_VALIDATION_ERROR'
  );

  // 2. Unexpected additional properties
  assert.throws(
    () =>
      ToolExecutionGateway.validateArguments(
        { to: '+15551234567', amountCents: 500, priority: 'high', rogueParam: 'malicious' },
        strictSchema
      ),
    (err: unknown) => err instanceof ToolExecutionGatewayError && err.message.includes('Unexpected parameter "rogueParam"')
  );

  // 3. Type mismatch (number passed where string expected)
  assert.throws(
    () =>
      ToolExecutionGateway.validateArguments(
        { to: 12345, amountCents: 500, priority: 'high' } as any,
        strictSchema
      ),
    (err: unknown) => err instanceof ToolExecutionGatewayError && err.message.includes('must be a string')
  );

  // 4. Value out of numeric bounds
  assert.throws(
    () =>
      ToolExecutionGateway.validateArguments(
        { to: '+15551234567', amountCents: 50, priority: 'high' },
        strictSchema
      ),
    (err: unknown) => err instanceof ToolExecutionGatewayError && err.message.includes('less than minimum allowed')
  );

  // 5. Enum restriction violation
  assert.throws(
    () =>
      ToolExecutionGateway.validateArguments(
        { to: '+15551234567', amountCents: 500, priority: 'critical' },
        strictSchema
      ),
    (err: unknown) => err instanceof ToolExecutionGatewayError && err.message.includes('Must be one of: low, medium, high')
  );

  // 6. Valid arguments strictly match schema
  assert.doesNotThrow(() =>
    ToolExecutionGateway.validateArguments(
      {
        to: '+15551234567',
        amountCents: 500,
        priority: 'high',
        isActive: true,
        tags: ['vip'],
        metadata: { source: 'inbound_call' },
      },
      strictSchema
    )
  );
});

// ============================================================================
// 4. SUBSCRIPTION ENTITLEMENT & ATOMIC QUOTA TESTS
// ============================================================================

test('EntitlementService enforces subscription tier hierarchy and quota limits', () => {
  const starterPlan = {
    id: 'ent-1',
    tenantId: 'tenant-starter',
    planTier: 'starter' as const,
    allowedCategories: ['scheduling' as const, 'crm' as const],
    maxActiveTools: 5,
    maxExecutionsPerMonth: 2000,
    currentCycleExecutions: 150,
    billingCycleStart: new Date().toISOString(),
    billingCycleEnd: new Date().toISOString(),
    isSuspended: false,
    overageAllowed: false,
    overageRateCents: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Starter cannot run Enterprise tool
  assert.throws(
    () => EntitlementService.checkEntitlement(starterPlan, 'scheduling', 'enterprise'),
    (err: unknown) => err instanceof EntitlementError && err.code === 'TIER_INSUFFICIENT'
  );

  // 2. Disallowed category
  assert.throws(
    () => EntitlementService.checkEntitlement(starterPlan, 'payment', 'starter'),
    (err: unknown) => err instanceof EntitlementError && err.code === 'CATEGORY_DISALLOWED'
  );

  // 3. Suspended tenant
  assert.throws(
    () => EntitlementService.checkEntitlement({ ...starterPlan, isSuspended: true }, 'scheduling', 'starter'),
    (err: unknown) => err instanceof EntitlementError && err.code === 'SUBSCRIPTION_SUSPENDED'
  );

  // 4. Quota exhaustion without overage
  assert.throws(
    () =>
      EntitlementService.checkEntitlement(
        { ...starterPlan, currentCycleExecutions: 2000, maxExecutionsPerMonth: 2000, overageAllowed: false },
        'scheduling',
        'starter'
      ),
    (err: unknown) => err instanceof EntitlementError && err.code === 'QUOTA_EXHAUSTED'
  );

  // 5. Quota overage permitted
  const res = EntitlementService.checkEntitlement(
    { ...starterPlan, currentCycleExecutions: 2050, maxExecutionsPerMonth: 2000, overageAllowed: true },
    'scheduling',
    'starter'
  );
  assert.equal(res.allowed, true);
  assert.equal(res.isOverage, true);
});

// ============================================================================
// 5. TOOL EXECUTION GATEWAY AUTHORIZATION & PERMISSION TESTS
// ============================================================================

test('ToolExecutionGateway validateAgentPermissions enforces assignment and capability scoping', () => {
  // 1. Unassigned agent
  assert.throws(
    () => ToolExecutionGateway.validateAgentPermissions('agent-sales', 'charge_card', undefined),
    (err: unknown) => err instanceof ToolExecutionGatewayError && err.code === 'AGENT_UNAUTHORIZED'
  );

  // 2. Disabled assignment
  assert.throws(
    () =>
      ToolExecutionGateway.validateAgentPermissions('agent-sales', 'charge_card', {
        id: 'assign-1',
        tenantId: 'tenant-1',
        agentId: 'agent-sales',
        toolInstallationId: 'inst-1',
        isEnabled: false,
        overrideParameters: {},
        maxCallsPerSession: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    (err: unknown) => err instanceof ToolExecutionGatewayError && err.code === 'AGENT_UNAUTHORIZED'
  );

  // 3. Capability restricted from agent scope
  assert.throws(
    () =>
      ToolExecutionGateway.validateAgentPermissions('agent-sales', 'refund_transaction', {
        id: 'assign-2',
        tenantId: 'tenant-1',
        agentId: 'agent-sales',
        toolInstallationId: 'inst-1',
        isEnabled: true,
        allowedCapabilities: ['create_payment_link'],
        overrideParameters: {},
        maxCallsPerSession: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    (err: unknown) => err instanceof ToolExecutionGatewayError && err.code === 'CAPABILITY_RESTRICTED'
  );

  // 4. Authorized capability in allowed list
  assert.doesNotThrow(() =>
    ToolExecutionGateway.validateAgentPermissions('agent-sales', 'create_payment_link', {
      id: 'assign-3',
      tenantId: 'tenant-1',
      agentId: 'agent-sales',
      toolInstallationId: 'inst-1',
      isEnabled: true,
      allowedCapabilities: ['create_payment_link', 'check_status'],
      overrideParameters: {},
      maxCallsPerSession: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  );
});

test('ToolExecutionGateway checkConsequentialApprovalRequired correctly flags consequential actions', () => {
  const consequentialCap = {
    id: 'cap-1',
    toolVersionId: 'ver-1',
    functionName: 'authorize_charge_on_call',
    displayName: 'Authorize Charge',
    description: 'Charges customer on call',
    riskLevel: 'critical_financial' as const,
    requiresApproval: true,
    operationType: 'consequential' as const,
    inputSchema: {},
    outputSchema: {},
    defaultTimeoutMs: 5000,
    rateLimitPerMinute: 60,
    createdAt: new Date().toISOString(),
  };
  assert.equal(ToolExecutionGateway.checkConsequentialApprovalRequired(consequentialCap), true);

  const safeCap = {
    id: 'cap-2',
    toolVersionId: 'ver-1',
    functionName: 'check_calendar_availability',
    displayName: 'Check Slots',
    description: 'Reads calendar',
    riskLevel: 'safe_read' as const,
    requiresApproval: false,
    operationType: 'read' as const,
    inputSchema: {},
    outputSchema: {},
    defaultTimeoutMs: 5000,
    rateLimitPerMinute: 60,
    createdAt: new Date().toISOString(),
  };
  assert.equal(ToolExecutionGateway.checkConsequentialApprovalRequired(safeCap), false);
});

// ============================================================================
// 7. DB-BACKED COLUMN MAPPING & GATEWAY SECURITY TESTS
// ============================================================================

import { setTestQueryHandler } from '../../db/connection';

test('ToolExecutionGateway explicit SQL aliases correctly populate typed fields and enforce behavior', async () => {
  // Test 1: cap_requires_approval = true pauses execution for approval
  setTestQueryHandler((sql: string) => {
    if (sql.includes('FROM tool_capabilities c')) {
      return {
        rows: [
          {
            cap_id: 'cap-charge-1',
            cap_tool_version_id: 'v1',
            cap_function_name: 'authorize_charge_on_call',
            cap_display_name: 'Authorize Charge',
            cap_description: 'Charges customer',
            cap_risk_level: 'critical_financial',
            cap_requires_approval: true,
            cap_operation_type: 'consequential',
            cap_input_schema: {
              type: 'object',
              required: ['amountCents'],
              properties: { amountCents: { type: 'integer' } },
            },
            tool_id: 't-stripe',
            tool_slug: 'stripe-billing',
            tool_name: 'Stripe Billing',
            tool_category: 'payment',
            tool_provider: 'stripe',
            tool_is_verified: true,
            tool_is_active: true,
            tool_min_plan_tier: 'starter',
            tool_cost_per_execution_cents: 10,
            inst_id: 'i-1',
            inst_tenant_id: 'tenant-100',
            inst_tool_id: 't-stripe',
            inst_tool_version_id: 'v1',
            inst_status: 'active',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (sql.includes('INSERT INTO tool_approval_requests')) {
      return {
        rows: [
          {
            id: 'appr-req-001',
            tenantId: 'tenant-100',
            sessionId: 's-100',
            toolName: 'Stripe Billing',
            capabilityName: 'authorize_charge_on_call',
            sanitizedArguments: { amountCents: 5000 },
            status: 'pending',
            requestedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          },
        ],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };
    }
    if (sql.includes('INSERT INTO tool_execution_logs')) {
      return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }
    return null;
  });

  try {
    const res = await ToolExecutionGateway.executeTool({
      tenantId: 'tenant-100',
      sessionId: 's-100',
      capabilityName: 'authorize_charge_on_call',
      arguments: { amountCents: 5000 },
      userRole: 'tenant_administrator',
    });

    assert.equal(res.success, false);
    assert.equal(res.pendingApproval, true);
    assert.equal(res.approvalRequestId, 'appr-req-001');
    assert.equal(res.errorCode, 'APPROVAL_REQUIRED');
  } finally {
    setTestQueryHandler(null);
  }
});

test('ToolExecutionGateway tool_min_plan_tier is strictly enforced from DB query alias', async () => {
  // Test 2: tool_min_plan_tier = 'enterprise' denies starter tenant
  setTestQueryHandler((sql: string) => {
    if (sql.includes('FROM tool_capabilities c')) {
      return {
        rows: [
          {
            cap_id: 'cap-mcp-1',
            cap_tool_version_id: 'v1',
            cap_function_name: 'mcp_query_inventory_catalog',
            cap_display_name: 'MCP Query',
            cap_description: 'MCP inventory',
            cap_risk_level: 'safe_read',
            cap_requires_approval: false,
            cap_operation_type: 'read',
            cap_input_schema: {
              type: 'object',
              required: ['productCode'],
              properties: { productCode: { type: 'string' } },
            },
            tool_id: 't-mcp',
            tool_slug: 'postgres-mcp',
            tool_name: 'Postgres MCP',
            tool_category: 'knowledge_mcp',
            tool_provider: 'anthropic_mcp',
            tool_is_verified: true,
            tool_is_active: true,
            tool_min_plan_tier: 'enterprise', // Strictly requires enterprise
            tool_cost_per_execution_cents: 5,
            inst_id: 'i-mcp',
            inst_tenant_id: 'tenant-starter-1',
            inst_tool_id: 't-mcp',
            inst_tool_version_id: 'v1',
            inst_status: 'active',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (sql.includes('FROM subscription_entitlements')) {
      return {
        rows: [
          {
            id: 'ent-starter',
            tenantId: 'tenant-starter-1',
            planTier: 'starter', // Starter tier
            allowedCategories: ['knowledge_mcp'],
            maxActiveTools: 5,
            maxExecutionsPerMonth: 2000,
            currentCycleExecutions: 10,
            isSuspended: false,
            overageAllowed: false,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (sql.includes('INSERT INTO tool_execution_logs')) {
      return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }
    return null;
  });

  try {
    const res = await ToolExecutionGateway.executeTool({
      tenantId: 'tenant-starter-1',
      sessionId: 's-200',
      capabilityName: 'mcp_query_inventory_catalog',
      arguments: { productCode: 'PRD-001' },
      userRole: 'tenant_administrator',
    });

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'TIER_INSUFFICIENT');
    assert.ok(String(res.error).includes('enterprise'));
  } finally {
    setTestQueryHandler(null);
  }
});

test('ToolExecutionGateway assign_is_enabled = false strictly denies agent invocation', async () => {
  // Test 3: assign_is_enabled = false triggers AGENT_UNAUTHORIZED
  setTestQueryHandler((sql: string) => {
    if (sql.includes('FROM tool_capabilities c')) {
      return {
        rows: [
          {
            cap_id: 'cap-read-1',
            cap_tool_version_id: 'v1',
            cap_function_name: 'lookup_contact_crm',
            cap_display_name: 'Lookup Contact',
            cap_description: 'Lookup Contact',
            cap_risk_level: 'safe_read',
            cap_requires_approval: false,
            cap_operation_type: 'read',
            cap_input_schema: { type: 'object' },
            tool_id: 't-crm',
            tool_slug: 'crm-sync',
            tool_name: 'CRM Sync',
            tool_category: 'crm',
            tool_provider: 'salesforce',
            tool_is_verified: true,
            tool_is_active: true,
            tool_min_plan_tier: 'starter',
            tool_cost_per_execution_cents: 0,
            inst_id: 'i-crm',
            inst_tenant_id: 'tenant-300',
            inst_tool_id: 't-crm',
            inst_tool_version_id: 'v1',
            inst_status: 'active',
            assign_id: 'a-1',
            assign_tenant_id: 'tenant-300',
            assign_agent_id: 'agent-disabled',
            assign_is_enabled: false, // Explicitly disabled
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (sql.includes('INSERT INTO tool_execution_logs')) {
      return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }
    return null;
  });

  try {
    const res = await ToolExecutionGateway.executeTool({
      tenantId: 'tenant-300',
      agentId: 'agent-disabled',
      sessionId: 's-300',
      capabilityName: 'lookup_contact_crm',
      arguments: {},
    });

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'AGENT_UNAUTHORIZED');
  } finally {
    setTestQueryHandler(null);
  }
});

test('ToolExecutionGateway blocks direct unprivileged manual invocation of write tools', async () => {
  setTestQueryHandler((sql: string) => {
    if (sql.includes('FROM tool_capabilities c')) {
      return {
        rows: [
          {
            cap_id: 'cap-write-1',
            cap_tool_version_id: 'v1',
            cap_function_name: 'create_payment_link',
            cap_display_name: 'Create Link',
            cap_description: 'Creates checkout link',
            cap_risk_level: 'standard_write',
            cap_requires_approval: false,
            cap_operation_type: 'write',
            cap_input_schema: { type: 'object' },
            tool_id: 't-stripe',
            tool_slug: 'stripe-billing',
            tool_name: 'Stripe Billing',
            tool_category: 'payment',
            tool_provider: 'stripe',
            tool_is_verified: true,
            tool_is_active: true,
            tool_min_plan_tier: 'starter',
            tool_cost_per_execution_cents: 10,
            inst_id: 'i-1',
            inst_tenant_id: 'tenant-400',
            inst_tool_id: 't-stripe',
            inst_tool_version_id: 'v1',
            inst_status: 'active',
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (sql.includes('INSERT INTO tool_execution_logs')) {
      return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }
    return null;
  });

  try {
    // Caller with tenant_staff role attempting manual write tool execution without an agent
    const res = await ToolExecutionGateway.executeTool({
      tenantId: 'tenant-400',
      sessionId: 's-400',
      capabilityName: 'create_payment_link',
      arguments: {},
      userRole: 'tenant_staff', // Unprivileged staff
    });

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'PERMISSION_DENIED');
  } finally {
    setTestQueryHandler(null);
  }
});

// ============================================================================
// 8. VOICE TOOL GATE DENIAL & APPROVAL STATE MACHINE TESTS
// ============================================================================

test('VoiceToolGate strictly preserves gateway denial and NEVER falls through to native fallback handlers', async () => {
  const gate = new VoiceToolGate({ agentId: 'agent-voice-1' });

  // Missing tenant fails closed immediately
  await assert.rejects(
    () => gate.executeTool('', 'schedule_calendar_session', {}),
    /Missing verified tenant context/
  );

  // Mock ToolExecutionGateway.executeTool to return a policy denial
  const originalExecute = ToolExecutionGateway.executeTool;
  try {
    (ToolExecutionGateway as any).executeTool = async () => {
      return {
        success: false,
        error: 'Execution denied: monthly quota exhausted for tenant.',
        errorCode: 'QUOTA_EXHAUSTED',
        durationMs: 15,
      };
    };

    // When gateway denies, gate must return denial, NOT fall through to native createBooking
    const res = await gate.executeTool('00000000-0000-0000-0000-000000000001', 'schedule_calendar_session', {
      date: '2026-11-01',
      timeSlot: '10:00 AM',
    });

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'QUOTA_EXHAUSTED');
    assert.ok(String(res.error).includes('monthly quota exhausted'));
    // Must NOT contain booking confirmation
    assert.equal((res as any).bookingId, undefined);
  } finally {
    ToolExecutionGateway.executeTool = originalExecute;
  }
});

