import { query } from '../config/database';
import type {
  BusinessProfile,
  CreateBusinessProfileDTO,
  UpdateBusinessProfileDTO,
  OperatingHours,
  KnowledgeSourceRef,
  EscalationPreferences,
} from '../domain/business-profile.types';

interface BusinessProfileRow {
  id: string;
  tenant_id: string;
  name: string;
  domain: string;
  industry: string;
  description: string;
  brand_tone: string;
  website_url: string | null;
  inbound_goal: string;
  outbound_goal: string;
  operating_hours: OperatingHours;
  knowledge_sources: KnowledgeSourceRef[];
  escalation_preferences: EscalationPreferences;
  dograh_workflow_id: number | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRow(row: BusinessProfileRow): BusinessProfile {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    domain: row.domain,
    industry: row.industry,
    description: row.description,
    brandTone: row.brand_tone,
    websiteUrl: row.website_url,
    inboundGoal: row.inbound_goal,
    outboundGoal: row.outbound_goal,
    operatingHours: row.operating_hours,
    knowledgeSources: row.knowledge_sources || [],
    escalationPreferences: row.escalation_preferences,
    dograhWorkflowId: row.dograh_workflow_id,
    isActive: row.is_active,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function getProfiles(tenantId: string): Promise<BusinessProfile[]> {
  const res = await query<BusinessProfileRow>(
    `SELECT * FROM business_ext.business_profiles
     WHERE tenant_id = $1
     ORDER BY created_at ASC`,
    [tenantId]
  );
  return res.rows.map(mapRow);
}

export async function getProfileById(
  tenantId: string,
  id: string
): Promise<BusinessProfile | null> {
  const res = await query<BusinessProfileRow>(
    `SELECT * FROM business_ext.business_profiles
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, id]
  );
  if (res.rows.length === 0 || !res.rows[0]) return null;
  return mapRow(res.rows[0]);
}

export async function getProfileByDomain(
  tenantId: string,
  domain: string
): Promise<BusinessProfile | null> {
  const res = await query<BusinessProfileRow>(
    `SELECT * FROM business_ext.business_profiles
     WHERE tenant_id = $1 AND domain = $2
     LIMIT 1`,
    [tenantId, domain]
  );
  if (res.rows.length === 0 || !res.rows[0]) return null;
  return mapRow(res.rows[0]);
}

export async function createProfile(
  tenantId: string,
  data: CreateBusinessProfileDTO
): Promise<BusinessProfile> {
  const res = await query<BusinessProfileRow>(
    `INSERT INTO business_ext.business_profiles (
      tenant_id, name, domain, industry, description, brand_tone,
      website_url, inbound_goal, outbound_goal, operating_hours,
      knowledge_sources, escalation_preferences, dograh_workflow_id, is_active
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14
    ) RETURNING *`,
    [
      tenantId,
      data.name,
      data.domain.toLowerCase().trim(),
      data.industry,
      data.description || '',
      data.brandTone || 'Professional and empathetic',
      data.websiteUrl || null,
      data.inboundGoal || 'Resolve customer inquiries and qualify needs.',
      data.outboundGoal || 'Assess prospect fit and schedule a consultation.',
      JSON.stringify(data.operatingHours || { timezone: 'UTC', schedule: {} }),
      JSON.stringify(data.knowledgeSources || []),
      JSON.stringify(data.escalationPreferences || { supervisorEmail: '', urgencyThreshold: 'high', autoNotify: true }),
      data.dograhWorkflowId ?? null,
      data.isActive ?? true,
    ]
  );

  const row = res.rows[0];
  if (!row) throw new Error('Failed to create business profile');
  return mapRow(row);
}

export async function updateProfile(
  tenantId: string,
  id: string,
  data: UpdateBusinessProfileDTO
): Promise<BusinessProfile | null> {
  const existing = await getProfileById(tenantId, id);
  if (!existing) return null;

  const res = await query<BusinessProfileRow>(
    `UPDATE business_ext.business_profiles SET
      name = COALESCE($3, name),
      domain = COALESCE($4, domain),
      industry = COALESCE($5, industry),
      description = COALESCE($6, description),
      brand_tone = COALESCE($7, brand_tone),
      website_url = COALESCE($8, website_url),
      inbound_goal = COALESCE($9, inbound_goal),
      outbound_goal = COALESCE($10, outbound_goal),
      operating_hours = COALESCE($11, operating_hours),
      knowledge_sources = COALESCE($12, knowledge_sources),
      escalation_preferences = COALESCE($13, escalation_preferences),
      dograh_workflow_id = CASE WHEN $14::boolean THEN $15 ELSE dograh_workflow_id END,
      is_active = COALESCE($16, is_active),
      updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [
      tenantId,
      id,
      data.name,
      data.domain?.toLowerCase().trim(),
      data.industry,
      data.description,
      data.brandTone,
      data.websiteUrl,
      data.inboundGoal,
      data.outboundGoal,
      data.operatingHours ? JSON.stringify(data.operatingHours) : null,
      data.knowledgeSources ? JSON.stringify(data.knowledgeSources) : null,
      data.escalationPreferences ? JSON.stringify(data.escalationPreferences) : null,
      data.dograhWorkflowId !== undefined, // Flag whether dograhWorkflowId was explicitly passed
      data.dograhWorkflowId ?? null,
      data.isActive,
    ]
  );

  if (res.rows.length === 0 || !res.rows[0]) return null;
  return mapRow(res.rows[0]);
}

export async function deleteProfile(
  tenantId: string,
  id: string
): Promise<boolean> {
  const res = await query(
    `DELETE FROM business_ext.business_profiles WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return (res.rowCount ?? 0) > 0;
}
