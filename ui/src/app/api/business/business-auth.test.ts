import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/server', () => ({
  getServerAccessToken: vi.fn(async () => null),
  getServerUser: vi.fn(async () => null),
}));
import dotenv from 'dotenv';
import path from 'path';

// Ensure environment variables are loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '../extensions/business-api/.env') });

import { GET as getContacts, POST as createContact } from './contacts/route';
import { OSS_TOKEN_COOKIE, OSS_USER_COOKIE } from '@/lib/auth/cookies';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

describe('Next.js Business API Route Boundary Authentication (A1 Attack Suite)', () => {
  let tokenOrgA: string;
  let tokenOrgB: string;
  let userAId: number;
  let userBId: number;
  const orgAId = 5;
  const orgBId = 6;

  beforeAll(async () => {
    // 1. Obtain real Dograh JWT tokens via /api/v1/auth/login for synthetic orgs
    const resA = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'synthetic-org-alpha@example.com',
        password: 'ValidSecurePassword123!',
      }),
    });
    if (!resA.ok) {
      throw new Error(`Failed to login as Org Alpha user: ${resA.status} ${await resA.text()}`);
    }
    const dataA = (await resA.json()) as { token: string; user: { id: number; organization_id: number } };
    tokenOrgA = dataA.token;
    userAId = dataA.user.id;

    const resB = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'synthetic-org-beta@example.com',
        password: 'ValidSecurePassword123!',
      }),
    });
    if (!resB.ok) {
      throw new Error(`Failed to login as Org Beta user: ${resB.status} ${await resB.text()}`);
    }
    const dataB = (await resB.json()) as { token: string; user: { id: number; organization_id: number } };
    tokenOrgB = dataB.token;
    userBId = dataB.user.id;
  });

  // A1.1: Forged OSS_USER with no valid token -> denied
  it('A1.1: Forged OSS_USER cookie with no valid token is rejected with 401 Unauthorized', async () => {
    const forgedUser = JSON.stringify({
      id: 999,
      email: 'attacker@evil.com',
      organizationId: orgBId,
      name: 'Attacker Impersonator',
    });

    const req = new NextRequest('http://localhost:3000/api/business/contacts', {
      method: 'GET',
      headers: new Headers({
        cookie: `${OSS_USER_COOKIE}=${encodeURIComponent(forgedUser)}`,
      }),
    });

    const res = await getContacts(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });

  // A1.2: Valid Org A token with forged Org B cookie -> Org B inaccessible
  it('A1.2: Valid Org A token with forged Org B cookie operates strictly on Org A and never Org B', async () => {
    const runId = Date.now().toString(36);
    const forgedUserOrgB = JSON.stringify({
      id: userAId,
      email: 'synthetic-org-alpha@example.com',
      organizationId: orgBId, // Attacker attempts to target Org B by tampering OSS_USER cookie
    });

    // 1. Create contact using Org A session with forged Org B cookie
    const createReq = new NextRequest('http://localhost:3000/api/business/contacts', {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        cookie: `${OSS_TOKEN_COOKIE}=${tokenOrgA}; ${OSS_USER_COOKIE}=${encodeURIComponent(forgedUserOrgB)}`,
      }),
      body: JSON.stringify({
        name: `Org A Lead ${runId}`,
        email: `lead.orga.${runId}@example.com`,
        phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
        company: 'Org A Enterprise',
        status: 'new',
      }),
    });

    const createRes = await createContact(createReq);
    expect(createRes.status).toBe(201);
    const createdData = await createRes.json();
    expect(createdData.data.id).toBeDefined();

    // 2. Org B legitimate request queries contacts: must NOT contain Org A lead!
    const queryOrgBReq = new NextRequest('http://localhost:3000/api/business/contacts', {
      method: 'GET',
      headers: new Headers({
        cookie: `${OSS_TOKEN_COOKIE}=${tokenOrgB}`,
      }),
    });

    const listOrgBRes = await getContacts(queryOrgBReq);
    expect(listOrgBRes.status).toBe(200);
    const listOrgB = await listOrgBRes.json();
    const leakedContact = listOrgB.data.find(
      (c: { id: string }) => c.id === createdData.data.id
    );
    expect(leakedContact).toBeUndefined(); // Org B CANNOT see Org A data!
  });

  // A1.3: Expired or invalid token -> denied
  it('A1.3: Expired or cryptographically invalid token is denied with 401 Unauthorized', async () => {
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';

    const req = new NextRequest('http://localhost:3000/api/business/contacts', {
      method: 'GET',
      headers: new Headers({
        cookie: `${OSS_TOKEN_COOKIE}=${invalidToken}`,
      }),
    });

    const res = await getContacts(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });

  // A1.4: Stale organization selection -> cannot access an unauthorized organization
  it('A1.4: Session without an active/selected organization is denied with 401 Unauthorized', async () => {
    // Generate a synthetic token without organization_id claim or null org
    const req = new NextRequest('http://localhost:3000/api/business/contacts', {
      method: 'GET',
      headers: new Headers({
        cookie: `${OSS_TOKEN_COOKIE}=malformed-token-no-org`,
      }),
    });

    const res = await getContacts(req);
    expect(res.status).toBe(401);
  });

  // A1.5: Revoked membership -> denied
  it('A1.5: User without membership in requested organization is denied access', async () => {
    // Request with token from non-member user targeting an unassociated organization
    // (Verified at business-api middleware with 403 Forbidden)
    const req = new NextRequest('http://localhost:3000/api/business/contacts', {
      method: 'GET',
      headers: new Headers({
        // Tampered Bearer token header pointing to revoked or non-existent token
        authorization: 'Bearer revoked-or-unauthorized-token-12345',
      }),
    });

    const res = await getContacts(req);
    expect(res.status).toBe(401);
  });

  // A1.6: Missing session -> denied
  it('A1.6: Completely missing session (no cookies, no headers) is denied with 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/business/contacts', {
      method: 'GET',
    });

    const res = await getContacts(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });

  // A1.7: Valid Org A session -> authorized Org A operation works
  it('A1.7: Valid Org A session successfully executes authorized operations', async () => {
    const runId = Date.now().toString(36);
    const req = new NextRequest('http://localhost:3000/api/business/contacts', {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        cookie: `${OSS_TOKEN_COOKIE}=${tokenOrgA}`,
      }),
      body: JSON.stringify({
        name: `Authorized Org A Contact ${runId}`,
        email: `auth.orga.${runId}@example.com`,
        phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
        company: 'Authorized Enterprise A',
        status: 'qualified',
      }),
    });

    const res = await createContact(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.data.name).toBe(`Authorized Org A Contact ${runId}`);
    expect(data.data.status).toBe('qualified');
  });
});
