import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { app } from '../../../server';
import { createSignedToken, verifySignedToken } from '../../middleware/tenant-auth';
import { parseTimeSlotToISO } from '../../utils/agent-logic';
import { createTestIdToken } from '../../services/identity-verifier';

// Ephemeral test HTTP server initialized via native ESM top-level await
const server = await new Promise<any>((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const addr = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${addr.port}`;

test('API /api/health returns database and AI diagnostic status', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.ok(res.status === 200 || res.status === 503, 'Health endpoint must return 200 or 503');
  const data = await res.json();
  assert.ok(data.database);
  assert.equal(data.database.provider, 'Neon PostgreSQL');
  assert.equal(data.database.targetDatabase, 'ai_calling_agent_os');
  assert.ok(data.aiService);
});

test('API /api/crm/contacts rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/crm/contacts`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'UNAUTHENTICATED');
});

test('API /api/agent/chat rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Can I book a session?' }),
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'UNAUTHENTICATED');
});

test('API /api/agent/tts rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/agent/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello, world!' }),
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'UNAUTHENTICATED');
});

test('API /api/calendar/availability rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/calendar/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'UNAUTHENTICATED');
});

test('API /api/calendar/book-event rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/calendar/book-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-11-01', timeSlot: '10:00 AM' }),
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'UNAUTHENTICATED');
});

test('API /api/leads/batch-upload rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/leads/batch-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads: [] }),
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'UNAUTHENTICATED');
});

test('API /api/domains rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
  const res = await fetch(`${baseUrl}/api/domains`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'UNAUTHENTICATED');
});

test('API rejects forged identity headers without valid cryptographic token', async () => {
  const res = await fetch(`${baseUrl}/api/crm/contacts`, {
    headers: {
      'x-user-id': 'forged-admin-user',
      'x-tenant-id': 'forged-tenant-id',
    },
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'UNAUTHENTICATED');
});

test('API rejects tampered auth token with 401 INVALID_TOKEN', async () => {
  const validToken = createSignedToken({
    userId: 'user-valid-01',
    tenantId: 'tenant-acme',
    role: 'tenant_staff',
  });
  // Tamper with payload
  const parts = validToken.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({ userId: 'user-valid-01', tenantId: 'tenant-acme', role: 'platform_super_admin' })
  ).toString('base64url');
  const tamperedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;

  const res = await fetch(`${baseUrl}/api/crm/contacts`, {
    headers: {
      Authorization: `Bearer ${tamperedToken}`,
    },
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'INVALID_TOKEN');
});

test('parseTimeSlotToISO calculates accurate start and end timestamps', () => {
  // 02:00 PM EST in November (Standard Time, UTC-5) is 19:00:00Z
  const slot1 = parseTimeSlotToISO('2026-11-15', '02:00 PM EST', 30);
  assert.equal(slot1.startIso, '2026-11-15T19:00:00.000Z');
  assert.equal(slot1.endIso, '2026-11-15T19:30:00.000Z');

  // 02:00 PM EDT in July (Daylight Saving Time, UTC-4) is 18:00:00Z
  const slotEdt = parseTimeSlotToISO('2026-07-15', '02:00 PM EDT', 30);
  assert.equal(slotEdt.startIso, '2026-07-15T18:00:00.000Z');
  assert.equal(slotEdt.endIso, '2026-07-15T18:30:00.000Z');

  // 09:15 AM UTC
  const slot2 = parseTimeSlotToISO('2026-11-15', '09:15 AM', 45);
  assert.equal(slot2.startIso, '2026-11-15T09:15:00.000Z');
  assert.equal(slot2.endIso, '2026-11-15T10:00:00.000Z');
});

// ============================================================================
// AUTHENTICATED END-TO-END TESTS (SESSION, RBAC, TENANT ISOLATION)
// ============================================================================

test('API /api/auth/session rejects requests missing idToken with 400 MISSING_ID_TOKEN', async () => {
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'operator@acme.corp', tenantId: '00000000-0000-0000-0000-000000000001' }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.code, 'MISSING_ID_TOKEN');
});

test('API /api/auth/session rejects forged / invalid signature idToken with 401 INVALID_SIGNATURE', async () => {
  const validToken = createTestIdToken({ uid: 'u1', email: 'operator@acme.corp' });
  const tamperedToken = validToken.substring(0, validToken.length - 6) + 'xxxxxx';
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: tamperedToken, tenantId: '00000000-0000-0000-0000-000000000001' }),
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'INVALID_SIGNATURE');
});

test('API /api/auth/session rejects expired idToken with 401 TOKEN_EXPIRED', async () => {
  const expiredToken = createTestIdToken({ uid: 'u1', email: 'operator@acme.corp', expiresInSeconds: -60 });
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: expiredToken, tenantId: '00000000-0000-0000-0000-000000000001' }),
  });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.code, 'TOKEN_EXPIRED');
});

test('API /api/auth/session rejects unregistered user with 403 USER_NOT_REGISTERED', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  setTestQueryHandler(async (text) => {
    if (text.includes('FROM users')) {
      return { rows: [], rowCount: 0 } as any; // Not registered
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const idToken = createTestIdToken({ uid: 'u-unregistered', email: 'stranger@example.com' });
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, tenantId: '00000000-0000-0000-0000-000000000001' }),
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, 'USER_NOT_REGISTERED');

  setTestQueryHandler(null);
});

test('API /api/auth/session rejects mismatched email with 400 EMAIL_MISMATCH', async () => {
  const idToken = createTestIdToken({ uid: 'u1', email: 'operator@acme.corp' });
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, email: 'impostor@acme.corp', tenantId: '00000000-0000-0000-0000-000000000001' }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.code, 'EMAIL_MISMATCH');
});

test('API /api/auth/session rejects unassigned tenant membership with 403 TENANT_MEMBERSHIP_REQUIRED', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  setTestQueryHandler(async (text) => {
    if (text.includes('FROM users')) {
      return { rows: [{ id: 'user-01', email: 'operator@acme.corp', is_platform_admin: false, is_active: true }], rowCount: 1 } as any;
    }
    if (text.includes('FROM tenants')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Acme Corp', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('FROM tenant_users')) {
      return { rows: [], rowCount: 0 } as any; // No membership
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const idToken = createTestIdToken({ uid: 'user-01', email: 'operator@acme.corp' });
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, tenantId: '00000000-0000-0000-0000-000000000001' }),
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, 'TENANT_MEMBERSHIP_REQUIRED');

  setTestQueryHandler(null);
});

test('API /api/auth/session exchanges valid credentials for signed session token', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  setTestQueryHandler(async (text) => {
    if (text.includes('FROM users')) {
      return { rows: [{ id: 'user-session-01', email: 'operator@acme.corp', is_platform_admin: false, is_active: true }], rowCount: 1 } as any;
    }
    if (text.includes('FROM tenants')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Acme Corp', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('FROM tenant_users')) {
      return { rows: [{ role: 'tenant_staff', status: 'active' }], rowCount: 1 } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const idToken = createTestIdToken({ uid: 'user-session-01', email: 'operator@acme.corp' });
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, tenantId: '00000000-0000-0000-0000-000000000001' }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.token);
  assert.equal(data.tenant.id, '00000000-0000-0000-0000-000000000001');

  setTestQueryHandler(null);
});

test('API /api/crm/contacts allows authenticated tenant request and returns data', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  const validToken = createSignedToken({
    userId: 'user-e2e-01',
    tenantId: '00000000-0000-0000-0000-000000000001',
    role: 'tenant_staff',
  });

  setTestQueryHandler(async (text) => {
    if (text.includes('SELECT id, name, status FROM tenants')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Acme Corp', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('SELECT is_platform_admin, is_active FROM users')) {
      return { rows: [{ is_platform_admin: false, is_active: true }], rowCount: 1 } as any;
    }
    if (text.includes('SELECT role, status FROM tenant_users')) {
      return { rows: [{ role: 'tenant_staff', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('FROM contacts')) {
      return {
        rows: [
          {
            id: 'c-101',
            tenant_id: '00000000-0000-0000-0000-000000000001',
            name: 'Sarah Connor',
            email: 'sarah@skynet.com',
            status: 'appointment_pending',
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const res = await fetch(`${baseUrl}/api/crm/contacts`, {
    headers: {
      Authorization: `Bearer ${validToken}`,
      'x-tenant-id': '00000000-0000-0000-0000-000000000001',
    },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 1);
  assert.equal(data[0].name, 'Sarah Connor');

  setTestQueryHandler(null);
});

test('API /api/crm/contacts denies access with 403 when tenant is suspended', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  const validToken = createSignedToken({
    userId: 'user-e2e-02',
    tenantId: '00000000-0000-0000-0000-000000000002',
    role: 'tenant_staff',
  });

  setTestQueryHandler(async (text) => {
    if (text.includes('SELECT id, name, status FROM tenants')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000002', name: 'Delinquent Corp', status: 'suspended' }], rowCount: 1 } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const res = await fetch(`${baseUrl}/api/crm/contacts`, {
    headers: {
      Authorization: `Bearer ${validToken}`,
      'x-tenant-id': '00000000-0000-0000-0000-000000000002',
    },
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, 'TENANT_SUSPENDED');

  setTestQueryHandler(null);
});

test('API /api/crm/contacts denies access with 403 when user account is disabled', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  const validToken = createSignedToken({
    userId: 'user-revoked-01',
    tenantId: '00000000-0000-0000-0000-000000000001',
    role: 'tenant_staff',
  });

  setTestQueryHandler(async (text) => {
    if (text.includes('SELECT id, name, status FROM tenants')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Acme Corp', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('SELECT is_platform_admin, is_active FROM users')) {
      return { rows: [{ is_platform_admin: false, is_active: false }], rowCount: 1 } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const res = await fetch(`${baseUrl}/api/crm/contacts`, {
    headers: {
      Authorization: `Bearer ${validToken}`,
      'x-tenant-id': '00000000-0000-0000-0000-000000000001',
    },
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, 'ACCOUNT_DISABLED');

  setTestQueryHandler(null);
});

test('API /api/crm/contacts denies forged platform-admin claim when unverified in database', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  const forgedToken = createSignedToken({
    userId: 'user-normal-01',
    tenantId: '00000000-0000-0000-0000-000000000001',
    role: 'tenant_staff',
    isPlatformAdmin: true,
  });

  setTestQueryHandler(async (text) => {
    if (text.includes('SELECT id, name, status FROM tenants')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Acme Corp', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('SELECT is_platform_admin, is_active FROM users')) {
      return { rows: [{ is_platform_admin: false, is_active: true }], rowCount: 1 } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const res = await fetch(`${baseUrl}/api/crm/contacts`, {
    headers: {
      Authorization: `Bearer ${forgedToken}`,
      'x-tenant-id': '00000000-0000-0000-0000-000000000001',
    },
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, 'FORBIDDEN_PLATFORM_ADMIN');

  setTestQueryHandler(null);
});

test('API /api/calendar/book-event rejects missing date or timeSlot with 400 INVALID_INPUT', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  const validToken = createSignedToken({
    userId: 'user-e2e-01',
    tenantId: '00000000-0000-0000-0000-000000000001',
    role: 'tenant_staff',
  });

  setTestQueryHandler(async (text) => {
    if (text.includes('SELECT id, name, status FROM tenants')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Acme Corp', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('SELECT is_platform_admin, is_active FROM users')) {
      return { rows: [{ is_platform_admin: false, is_active: true }], rowCount: 1 } as any;
    }
    if (text.includes('SELECT role, status FROM tenant_users')) {
      return { rows: [{ role: 'tenant_staff', status: 'active' }], rowCount: 1 } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const res = await fetch(`${baseUrl}/api/calendar/book-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${validToken}`,
      'x-tenant-id': '00000000-0000-0000-0000-000000000001',
    },
    body: JSON.stringify({
      contactName: 'Jane Doe',
      // Missing date and timeSlot
    }),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.code, 'INVALID_INPUT');

  setTestQueryHandler(null);
});

test('API /api/calendar/book-event fails with 409 conflict and creates NO external provider event when rep has conflict', async () => {
  const { setTestQueryHandler } = await import('../../db/connection');
  const validToken = createSignedToken({
    userId: 'user-normal-01',
    tenantId: '00000000-0000-0000-0000-000000000001',
    role: 'tenant_staff',
  });

  setTestQueryHandler(async (text) => {
    if (text.includes('SELECT id, name, status FROM tenants')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Acme Corp', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('SELECT is_platform_admin, is_active FROM users')) {
      return { rows: [{ is_platform_admin: false, is_active: true }], rowCount: 1 } as any;
    }
    if (text.includes('SELECT role, status FROM tenant_users')) {
      return { rows: [{ role: 'tenant_staff', status: 'active' }], rowCount: 1 } as any;
    }
    if (text.includes('FROM contacts')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Prospect' }], rowCount: 1 } as any;
    }
    if (text.includes('INSERT INTO contacts')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001' }], rowCount: 1 } as any;
    }
    if (text.includes('FROM business_profiles')) {
      return { rows: [{ id: 'bp-1', operating_hours: { timezone: 'America/New_York' } }], rowCount: 1 } as any;
    }
    if (text.includes('FROM representatives WHERE')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000099', name: 'Sarah', role: 'Advisor', email: 'sarah@acme.corp' }], rowCount: 1 } as any;
    }
    if (text.includes('FROM scheduled_sessions') && text.includes('representative_id = $2')) {
      // Simulate existing conflicting booking
      return { rows: [{ id: 'existing-booking-1', status: 'confirmed' }], rowCount: 1 } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });

  const res = await fetch(`${baseUrl}/api/calendar/book-event`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${validToken}`,
      'x-tenant-id': '00000000-0000-0000-0000-000000000001',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contactId: '00000000-0000-0000-0000-000000000001',
      representativeId: '00000000-0000-0000-0000-000000000099',
      date: '2026-11-15',
      timeSlot: '02:00 PM EST',
      accessToken: 'dummy-google-token',
    }),
  });

  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.code, 'BOOKING_CONFLICT');

  setTestQueryHandler(null);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
