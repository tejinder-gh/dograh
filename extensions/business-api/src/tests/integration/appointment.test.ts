import { describe, it, expect, beforeAll } from 'bun:test';
import { createApp } from '../../app';
import { runMigrations } from '../../config/migrator';
import { query } from '../../config/database';
import { adminQuery } from '../test-admin';
import { env } from '../../config/env';
import { createInternalAssertion } from '../../config/signed-assertion';
import type { Appointment, AvailableSlot } from '../../domain/appointment.types';

describe('Integration: Multi-Tenant Appointment Booking & Slot Collision Suite (CAL-01)', () => {
  const app = createApp();
  const validSecret = env.BUSINESS_EXT_SECRET;
  const deploymentId = env.ACUITY_DEPLOYMENT_ID || 'default';

  const orgA = 801;
  const userA = '801';
  let tenantA: string;

  const orgB = 802;
  const userB = '802';
  let tenantB: string;

  let contactAId: string;
  let appointmentAId: string;

  beforeAll(async () => {
    await runMigrations();

    // 0. Seed authoritative Acuity tables
    await adminQuery(`
      INSERT INTO public.organizations (id, provider_id)
      VALUES (801, 'org_test_801'), (802, 'org_test_802')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.users (id, email, provider_id)
      VALUES (801, 'user801@example.com', 'user_test_801'),
             (802, 'user802@example.com', 'user_test_802')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

      INSERT INTO public.organization_users (user_id, organization_id)
      VALUES (801, 801), (802, 802)
      ON CONFLICT (user_id, organization_id) DO NOTHING;
    `);

    // Setup Org A
    const mapARes = await query<{ business_tenant_id: string }>(
      `INSERT INTO business_ext.organization_mappings (acuity_organization_id, deployment_id)
       VALUES ($1, $2)
       ON CONFLICT (deployment_id, acuity_organization_id)
       DO UPDATE SET updated_at = NOW()
       RETURNING business_tenant_id`,
      [orgA, deploymentId]
    );
    tenantA = mapARes.rows[0]!.business_tenant_id;

    await query(
      `INSERT INTO business_ext.organization_subscriptions
       (tenant_id, plan_id, status, included_minutes, concurrency_limit)
       VALUES ($1, 'professional', 'active', 1000, 5)
       ON CONFLICT (tenant_id) DO UPDATE SET status = 'active'`,
      [tenantA]
    );

    // Create a contact for Org A
    const contactRes = await query<{ id: string }>(
      `INSERT INTO business_ext.contacts
       (tenant_id, name, email, phone, status, lifecycle_status)
       VALUES ($1, 'John Prospect', 'john@skillcorner.com', '+15551239876', 'new', 'new')
       RETURNING id`,
      [tenantA]
    );
    contactAId = contactRes.rows[0]!.id;

    // Setup Org B
    const mapBRes = await query<{ business_tenant_id: string }>(
      `INSERT INTO business_ext.organization_mappings (acuity_organization_id, deployment_id)
       VALUES ($1, $2)
       ON CONFLICT (deployment_id, acuity_organization_id)
       DO UPDATE SET updated_at = NOW()
       RETURNING business_tenant_id`,
      [orgB, deploymentId]
    );
    tenantB = mapBRes.rows[0]!.business_tenant_id;

    await query(
      `INSERT INTO business_ext.organization_subscriptions
       (tenant_id, plan_id, status, included_minutes, concurrency_limit)
       VALUES ($1, 'starter', 'active', 250, 2)
       ON CONFLICT (tenant_id) DO UPDATE SET status = 'active'`,
      [tenantB]
    );
  });

  it('1. Queries available appointment slots during business hours', async () => {
    const path = '/api/appointments/availability?startDate=2026-11-10T00:00:00Z&durationMinutes=30';
    const assertion = createInternalAssertion({
      userId: userA,
      orgId: orgA,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
    });

    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': assertion },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: AvailableSlot[] };
    expect(body.data).toBeDefined();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]?.available).toBe(true);
  });

  it('2. Successfully books an appointment and advances contact lifecycle to booked', async () => {
    const path = '/api/appointments';
    const payload = JSON.stringify({
      contactId: contactAId,
      title: 'Skill Corner Voice OS Demo Consultation',
      startTime: '2026-11-10T14:00:00.000Z',
      endTime: '2026-11-10T14:30:00.000Z',
      source: 'agent',
      resultingDealValue: 5000,
      notes: 'Prospect interested in automated calling pilot',
    });

    const assertion = createInternalAssertion({
      userId: userA,
      orgId: orgA,
      deploymentId,
      secret: validSecret,
      method: 'POST',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Appointment };
    expect(body.data.id).toBeDefined();
    expect(body.data.title).toBe('Skill Corner Voice OS Demo Consultation');
    expect(body.data.status).toBe('confirmed');
    appointmentAId = body.data.id;

    // Verify contact was updated to booked
    const contactCheck = await query<{ status: string; lifecycle_status: string }>(
      `SELECT status, lifecycle_status FROM business_ext.contacts WHERE id = $1`,
      [contactAId]
    );
    expect(contactCheck.rows[0]?.lifecycle_status).toBe('booked');
    expect(contactCheck.rows[0]?.status).toBe('booked');

    // Verify contact timeline audit event
    const timeline = await query<{ event: string }>(
      `SELECT event FROM business_ext.contact_timeline_events WHERE contact_id = $1`,
      [contactAId]
    );
    expect(timeline.rows.some((t) => t.event === 'appointment_booked')).toBe(true);
  });

  it('3. Prevents slot collision with 409 Conflict when overlapping slot is booked', async () => {
    const path = '/api/appointments';
    // Overlapping: 14:15 - 14:45 overlaps with 14:00 - 14:30
    const payload = JSON.stringify({
      title: 'Conflicting Booking Request',
      startTime: '2026-11-10T14:15:00.000Z',
      endTime: '2026-11-10T14:45:00.000Z',
      source: 'web',
    });

    const assertion = createInternalAssertion({
      userId: userA,
      orgId: orgA,
      deploymentId,
      secret: validSecret,
      method: 'POST',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('already booked');
  });

  it('4. Reschedules appointment to a non-conflicting time', async () => {
    const path = `/api/appointments/${appointmentAId}/reschedule`;
    const payload = JSON.stringify({
      startTime: '2026-11-10T15:00:00.000Z',
      endTime: '2026-11-10T15:30:00.000Z',
      notes: 'Rescheduled upon client request',
    });

    const assertion = createInternalAssertion({
      userId: userA,
      orgId: orgA,
      deploymentId,
      secret: validSecret,
      method: 'PATCH',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Appointment };
    expect(body.data.status).toBe('rescheduled');
    expect(body.data.startTime).toBe('2026-11-10T15:00:00.000Z');
  });

  it('5. Updates appointment status to completed', async () => {
    const path = `/api/appointments/${appointmentAId}/status`;
    const payload = JSON.stringify({
      status: 'completed',
      notes: 'Demo completed successfully, sending proposal.',
    });

    const assertion = createInternalAssertion({
      userId: userA,
      orgId: orgA,
      deploymentId,
      secret: validSecret,
      method: 'PATCH',
      path,
      body: payload,
    });

    const res = await app.request(path, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Assertion': assertion,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Appointment };
    expect(body.data.status).toBe('completed');
  });

  it('6. Enforces tenant isolation: Organization B cannot read or modify Org A appointment', async () => {
    const path = `/api/appointments/${appointmentAId}`;
    const assertion = createInternalAssertion({
      userId: userB,
      orgId: orgB,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path,
    });

    // Org B attempts to read Org A's appointment
    const res = await app.request(path, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': assertion },
    });
    expect(res.status).toBe(404);

    // Org B directory list does not contain Org A's appointment
    const listPath = '/api/appointments';
    const listAssertion = createInternalAssertion({
      userId: userB,
      orgId: orgB,
      deploymentId,
      secret: validSecret,
      method: 'GET',
      path: listPath,
    });

    const listRes = await app.request(listPath, {
      method: 'GET',
      headers: { 'X-Internal-Assertion': listAssertion },
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { data: Appointment[] };
    expect(listBody.data.some((a) => a.id === appointmentAId)).toBe(false);
  });
});
