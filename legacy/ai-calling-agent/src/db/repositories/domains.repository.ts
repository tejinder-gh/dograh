import { withTenantContext } from '../connection';
import { ClientCompanyDomain, CompanyRepresentative } from '../../types';

export async function getBusinessProfiles(tenantId: string): Promise<ClientCompanyDomain[]> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `SELECT bp.*, 
              a.inbound_goal, a.inbound_calendar_link, a.inbound_rep_id,
              a.outbound_goal, a.outbound_calendar_link, a.outbound_rep_id,
              a.telephony_config
       FROM business_profiles bp
       LEFT JOIN agents a ON a.business_profile_id = bp.id
       WHERE bp.tenant_id = $1
       ORDER BY bp.created_at ASC`,
      [tenantId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      industry: row.industry,
      description: row.description || '',
      brandTone: row.brand_tone || 'Professional and empathetic',
      knowledgeBaseSnippets: row.knowledge_base_snippets || [],
      inboundGoal: row.inbound_goal || 'Resolve customer inquiries and book a 1-on-1 discovery session.',
      inboundCalendarLink: row.inbound_calendar_link || '',
      inboundRepId: row.inbound_rep_id || 'rep-1',
      outboundGoal: row.outbound_goal || 'Qualify leads and schedule a technical walkthrough.',
      outboundCalendarLink: row.outbound_calendar_link || '',
      outboundRepId: row.outbound_rep_id || 'rep-2',
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      voipSettings: row.telephony_config || undefined,
    }));
  });
}

export async function getBusinessProfileById(
  tenantId: string,
  id: string
): Promise<ClientCompanyDomain | null> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `SELECT bp.*, 
              a.inbound_goal, a.inbound_calendar_link, a.inbound_rep_id,
              a.outbound_goal, a.outbound_calendar_link, a.outbound_rep_id,
              a.telephony_config
       FROM business_profiles bp
       LEFT JOIN agents a ON a.business_profile_id = bp.id
       WHERE bp.tenant_id = $1 AND (bp.id = $2 OR bp.domain = $2)
       LIMIT 1`,
      [tenantId, id]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      industry: row.industry,
      description: row.description || '',
      brandTone: row.brand_tone || 'Professional and empathetic',
      knowledgeBaseSnippets: row.knowledge_base_snippets || [],
      inboundGoal: row.inbound_goal || 'Resolve customer inquiries and book a 1-on-1 discovery session.',
      inboundCalendarLink: row.inbound_calendar_link || '',
      inboundRepId: row.inbound_rep_id || 'rep-1',
      outboundGoal: row.outbound_goal || 'Qualify leads and schedule a technical walkthrough.',
      outboundCalendarLink: row.outbound_calendar_link || '',
      outboundRepId: row.outbound_rep_id || 'rep-2',
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      voipSettings: row.telephony_config || undefined,
    };
  });
}

export async function saveBusinessProfile(
  tenantId: string,
  profile: Partial<ClientCompanyDomain>
): Promise<ClientCompanyDomain> {
  const targetProfileId = await withTenantContext(tenantId, undefined, async (client) => {
    let profileId = profile.id;
    const isNew = !profileId || profileId.startsWith('domain-') || profileId.length < 10;

    if (isNew) {
      const ins = await client.query(
        `INSERT INTO business_profiles (
          tenant_id, name, domain, industry, description, brand_tone,
          knowledge_base_snippets, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, NOW(), NOW()
        ) RETURNING id`,
        [
          tenantId,
          profile.name || 'New Client Company',
          profile.domain || 'example.com',
          profile.industry || 'general',
          profile.description || '',
          profile.brandTone || 'Professional and empathetic',
          JSON.stringify(profile.knowledgeBaseSnippets || []),
        ]
      );
      profileId = ins.rows[0].id;

      // Create linked default agent
      await client.query(
        `INSERT INTO agents (
          tenant_id, business_profile_id, name, persona, voice_id,
          inbound_goal, inbound_calendar_link, outbound_goal, outbound_calendar_link
        ) VALUES (
          $1, $2, $3, $4, 'Kore',
          $5, $6, $7, $8
        )`,
        [
          tenantId,
          profileId,
          `${profile.name || 'Company'} Voice Agent`,
          `You are an empathetic, knowledgeable representative for ${profile.name || 'our company'}.`,
          profile.inboundGoal || 'Resolve customer inquiries and book a 1-on-1 discovery session.',
          profile.inboundCalendarLink || '',
          profile.outboundGoal || 'Qualify leads and schedule a technical walkthrough.',
          profile.outboundCalendarLink || '',
        ]
      );
    } else {
      await client.query(
        `UPDATE business_profiles SET
          name = COALESCE($3, name),
          domain = COALESCE($4, domain),
          industry = COALESCE($5, industry),
          description = COALESCE($6, description),
          brand_tone = COALESCE($7, brand_tone),
          knowledge_base_snippets = COALESCE($8, knowledge_base_snippets),
          updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [
          tenantId,
          profileId,
          profile.name,
          profile.domain,
          profile.industry,
          profile.description,
          profile.brandTone,
          profile.knowledgeBaseSnippets ? JSON.stringify(profile.knowledgeBaseSnippets) : null,
        ]
      );

      // Update linked agent
      await client.query(
        `UPDATE agents SET
          inbound_goal = COALESCE($3, inbound_goal),
          inbound_calendar_link = COALESCE($4, inbound_calendar_link),
          outbound_goal = COALESCE($5, outbound_goal),
          outbound_calendar_link = COALESCE($6, outbound_calendar_link),
          updated_at = NOW()
         WHERE tenant_id = $1 AND business_profile_id = $2`,
        [
          tenantId,
          profileId,
          profile.inboundGoal,
          profile.inboundCalendarLink,
          profile.outboundGoal,
          profile.outboundCalendarLink,
        ]
      );
    }

    return profileId as string;
  });

  const savedProfile = await getBusinessProfileById(tenantId, targetProfileId);
  if (!savedProfile) {
    throw new Error(`Failed to retrieve committed business profile for ID "${targetProfileId}"`);
  }
  return savedProfile;
}

export async function deleteBusinessProfile(
  tenantId: string,
  id: string
): Promise<boolean> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `DELETE FROM business_profiles WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return (res.rowCount ?? 0) > 0;
  });
}

export async function getRepresentatives(
  tenantId: string
): Promise<CompanyRepresentative[]> {
  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `SELECT * FROM representatives WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenantId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role || '',
      specialization: r.specialization || '',
      email: r.email,
      avatar: r.avatar || '',
      availableDays: r.available_days || [],
      availableSlots: r.available_slots || [],
    }));
  });
}

export async function saveRepresentative(
  tenantId: string,
  rep: Partial<CompanyRepresentative>
): Promise<CompanyRepresentative> {
  if (!rep.name || !rep.role || !rep.email) {
    throw new Error('Representative name, role, and email are required');
  }

  const name = rep.name.trim();
  const role = rep.role.trim();
  const email = rep.email.trim();

  return withTenantContext(tenantId, undefined, async (client) => {
    const res = await client.query(
      `INSERT INTO representatives (
        tenant_id, name, role, specialization, email, avatar, available_days, available_slots, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      ) RETURNING *`,
      [
        tenantId,
        name,
        role,
        rep.specialization?.trim() || '',
        email,
        rep.avatar?.trim() || null,
        rep.availableDays || [],
        rep.availableSlots || [],
      ]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      specialization: r.specialization || '',
      email: r.email,
      avatar: r.avatar || '',
      availableDays: r.available_days || [],
      availableSlots: r.available_slots || [],
    };
  });
}
