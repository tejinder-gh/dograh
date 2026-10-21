import { query } from '../src/config/database';
import { adminQuery } from '../src/tests/test-admin';
import { resolveTenantContext } from '../src/services/tenant-mapping.service';

async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_ANALYTICS_SEED !== 'true') {
    console.error(
      '[seed] ERROR: Seeding is blocked. To run this script against an isolated test/development database, explicitly set ALLOW_ANALYTICS_SEED=true and ensure NODE_ENV != "production".'
    );
    process.exit(1);
  }

  console.log('[seed] Starting enterprise analytics seeding in development environment...');

  // 1. Resolve durable tenant mapping for Organization 1
  const tenantCtx = await resolveTenantContext(1, 'default');
  const tenantId = tenantCtx.businessTenantId;
  console.log('[seed] Resolved Tenant ID for Org 1:', tenantId);

  // 3. Ensure business profile exists
  await query(`
    INSERT INTO business_ext.business_profiles (
      id, tenant_id, name, domain, industry, description, brand_tone, website_url, inbound_goal, outbound_goal, is_active
    ) VALUES (
      gen_random_uuid(), $1, 'Apex Dental Partners', 'apexdental.com', 'Healthcare',
      'High-volume premier dental clinic and patient services practice',
      'Professional, empathetic, and attentive', 'https://apexdental.com',
      'Schedule appointments and handle insurance verification',
      'Appointment confirmation and patient reactivation', true
    )
    ON CONFLICT (tenant_id, domain) DO UPDATE SET name = EXCLUDED.name;
  `, [tenantId]);

  // 4. Ensure workflows exist for Org 1
  const wf1Res = await adminQuery<{ id: number }>(`
    INSERT INTO public.workflows (
      organization_id, name, workflow_definition, template_context_variables,
      call_disposition_codes, workflow_configurations, workflow_uuid
    ) VALUES (
      1, 'Front Desk Patient Intake Agent', '{}', '{}',
      '[]', '{}', gen_random_uuid()::text
    ) RETURNING id;
  `);
  const wf1Id = wf1Res.rows[0]?.id || 1;

  const wf2Res = await adminQuery<{ id: number }>(`
    INSERT INTO public.workflows (
      organization_id, name, workflow_definition, template_context_variables,
      call_disposition_codes, workflow_configurations, workflow_uuid
    ) VALUES (
      1, 'After-Hours Emergency Triage Agent', '{}', '{}',
      '[]', '{}', gen_random_uuid()::text
    ) RETURNING id;
  `);
  const wf2Id = wf2Res.rows[0]?.id || 2;

  console.log('[seed] Workflows created:', { wf1Id, wf2Id });

  // 5. Seed workflow runs over the past 30 days
  const now = Date.now();
  for (let day = 0; day < 28; day++) {
    // 3-6 calls per day
    const callsCount = Math.floor(Math.random() * 4) + 3;
    for (let c = 0; c < callsCount; c++) {
      const hour = Math.floor(Math.random() * 14) + 8; // 8am to 10pm
      const callTime = new Date(now - (day * 86400000) - (hour * 3600000));
      const wfId = Math.random() > 0.35 ? wf1Id : wf2Id;
      const isCompleted = Math.random() > 0.12;
      const state = isCompleted ? 'completed' : 'initialized';
      const duration = isCompleted ? Math.floor(Math.random() * 180) + 45 : 0;
      const cost = isCompleted ? Math.round((0.02 + (duration / 60) * 0.035) * 1000) / 1000 : 0.005;

      await adminQuery(`
        INSERT INTO public.workflow_runs (
          workflow_id, name, mode, state, call_type, is_completed, usage_info, cost_info,
          initial_context, gathered_context, annotations, created_at,
          model_configuration_snapshot
        ) VALUES (
          $1, $2, 'telephony', $3, 'inbound', $4,
          $5, $6, '{}', '{}', '{}', $7,
          '{"provider": "OpenAI", "model": "gpt-4o-mini"}'
        );
      `, [
        wfId,
        `Patient Call #${day * 10 + c}`,
        state,
        isCompleted,
        JSON.stringify({ call_duration_seconds: duration }),
        JSON.stringify({ total_cost_usd: cost }),
        callTime,
      ]);
    }
  }

  // 6. Seed CRM Contacts
  const contactNames = [
    ['Sarah', 'Connor', 'sarah.c@example.com', '+14155552671', 'qualified', 88],
    ['Michael', 'Scott', 'm.scott@dunder.com', '+12125553902', 'qualified', 92],
    ['Elena', 'Rostova', 'elena.r@example.org', '+13125559812', 'new', 65],
    ['David', 'Miller', 'dmiller@company.io', '+16175558190', 'qualified', 95],
    ['Amanda', 'Bynes', 'amanda.b@example.net', '+17185551029', 'booked', 98],
    ['James', 'Holden', 'j.holden@roci.org', '+12065554321', 'qualified', 84],
    ['Naomi', 'Nagata', 'naomi.n@belt.com', '+15035557766', 'new', 70],
    ['Alex', 'Kamal', 'alex.k@mars.gov', '+14155559090', 'qualified', 89],
  ];

  const contactIds: string[] = [];
  for (const [first, last, email, phone, status, score] of contactNames) {
    const fullName = `${first} ${last}`;
    const res = await query<{ id: string }>(`
      INSERT INTO business_ext.contacts (
        tenant_id, name, email, phone, lifecycle_status, lead_score, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '10 days', NOW())
      RETURNING id;
    `, [tenantId, fullName, email, phone, status, score]);
    if (res.rows[0]?.id) contactIds.push(res.rows[0].id);
  }

  // 7. Seed Appointments
  const apptTitles = [
    'Comprehensive Dental Exam & Cleaning',
    'Root Canal Consultation',
    'Orthodontic Alignment Assessment',
    'Emergency Tooth Pain Diagnostic',
    'Teeth Whitening Consultation',
  ];

  for (let i = 0; i < apptTitles.length; i++) {
    const title = apptTitles[i];
    const contactId = contactIds[i % contactIds.length];
    const startTime = new Date(now + ((i + 1) * 86400000));
    const endTime = new Date(startTime.getTime() + 45 * 60000);
    const dealValue = 150 + i * 120;

    await query(`
      INSERT INTO business_ext.appointments (
        tenant_id, contact_id, acuity_workflow_id, title, status, start_time, end_time,
        source, resulting_deal_value, notes, created_at
      ) VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, 'agent', $7, 'Scheduled via AI voice intake', NOW());
    `, [tenantId, contactId, wf1Id, title, startTime, endTime, dealValue]);
  }

  // 8. Seed Interactions
  for (let i = 0; i < 15; i++) {
    const contactId = contactIds[i % contactIds.length];
    const sentiment = Math.floor(65 + Math.random() * 30); // 65-95
    await query(`
      INSERT INTO business_ext.interactions (
        tenant_id, contact_id, channel, sentiment_score, sentiment_category,
        was_escalated, summary, created_at
      ) VALUES ($1, $2, 'call_inbound', $3, 'positive', false, 'Autonomous call successfully resolved', NOW() - (INTERVAL '1 day' * $4));
    `, [tenantId, contactId, sentiment, i]);
  }

  console.log('[seed] Enterprise analytics seed complete!');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Seed failed:', err);
    process.exit(1);
  });
