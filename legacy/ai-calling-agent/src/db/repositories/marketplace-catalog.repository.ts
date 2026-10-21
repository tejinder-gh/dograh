import { query } from '../connection';
import {
  ToolCategory,
  ToolDefinition,
  TenantToolInstallation,
  AgentToolAssignment,
  ToolCapability,
} from '../../types/marketplace.types';
import { EntitlementService, EntitlementError } from '../../services/entitlement.service';

export async function listCatalogTools(params?: {
  category?: ToolCategory;
  search?: string;
}): Promise<ToolDefinition[]> {
  const conditions: string[] = ['is_active = true'];
  const values: unknown[] = [];

  if (params?.category) {
    values.push(params.category);
    conditions.push(`category = $${values.length}`);
  }

  if (params?.search) {
    values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(`(LOWER(name) LIKE $${values.length} OR LOWER(description) LIKE $${values.length} OR LOWER(provider) LIKE $${values.length})`);
  }

  const sql = `
    SELECT 
      id, slug, name, category, provider, 
      tool_type as "toolType", 
      description, 
      icon_name as "iconName", 
      documentation_url as "documentationUrl", 
      is_verified as "isVerified", 
      is_active as "isActive", 
      min_plan_tier as "minPlanTier", 
      pricing_model as "pricingModel", 
      cost_per_execution_cents as "costPerExecutionCents", 
      created_at as "createdAt", 
      updated_at as "updatedAt"
    FROM tool_definitions
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ASC
  `;

  const res = await query<ToolDefinition>(sql, values);
  return res.rows;
}

export async function getCatalogToolBySlug(slug: string): Promise<ToolDefinition | null> {
  const toolRes = await query<ToolDefinition>(
    `SELECT 
      id, slug, name, category, provider, 
      tool_type as "toolType", 
      description, 
      icon_name as "iconName", 
      documentation_url as "documentationUrl", 
      is_verified as "isVerified", 
      is_active as "isActive", 
      min_plan_tier as "minPlanTier", 
      pricing_model as "pricingModel", 
      cost_per_execution_cents as "costPerExecutionCents", 
      created_at as "createdAt", 
      updated_at as "updatedAt"
    FROM tool_definitions
    WHERE slug = $1`,
    [slug]
  );

  const tool = toolRes.rows[0];
  if (!tool) return null;

  // Fetch versions and capabilities
  const versionsRes = await query<{
    id: string;
    tool_id: string;
    version_string: string;
    status: string;
    changelog?: string;
    manifest: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT id, tool_id, version_string, status, changelog, manifest, created_at 
     FROM tool_versions WHERE tool_id = $1 ORDER BY created_at DESC`,
    [tool.id]
  );

  const versions = [];
  for (const v of versionsRes.rows) {
    const capsRes = await query<ToolCapability>(
      `SELECT 
        id, 
        tool_version_id as "toolVersionId", 
        function_name as "functionName", 
        display_name as "displayName", 
        description, 
        risk_level as "riskLevel", 
        requires_approval as "requiresApproval", 
        operation_type as "operationType", 
        input_schema as "inputSchema", 
        output_schema as "outputSchema", 
        default_timeout_ms as "defaultTimeoutMs", 
        rate_limit_per_minute as "rateLimitPerMinute", 
        created_at as "createdAt"
      FROM tool_capabilities 
      WHERE tool_version_id = $1 ORDER BY function_name ASC`,
      [v.id]
    );

    versions.push({
      id: v.id,
      toolId: v.tool_id,
      versionString: v.version_string,
      status: v.status as any,
      changelog: v.changelog,
      manifest: v.manifest,
      createdAt: v.created_at,
      capabilities: capsRes.rows,
    });
  }

  return { ...tool, versions };
}

export async function listTenantInstallations(tenantId: string): Promise<TenantToolInstallation[]> {
  const sql = `
    SELECT 
      i.id, 
      i.tenant_id as "tenantId", 
      i.tool_id as "toolId", 
      i.tool_version_id as "toolVersionId", 
      i.provider_connection_id as "providerConnectionId", 
      i.status, 
      i.custom_settings as "customSettings", 
      i.enabled_scopes as "enabledScopes", 
      i.installed_at as "installedAt", 
      i.updated_at as "updatedAt",
      row_to_json(t.*) as tool,
      row_to_json(c.*) as connection
    FROM tenant_tool_installations i
    JOIN tool_definitions t ON i.tool_id = t.id
    LEFT JOIN tenant_provider_connections c ON i.provider_connection_id = c.id
    WHERE i.tenant_id = $1
    ORDER BY i.installed_at DESC
  `;

  const res = await query<any>(sql, [tenantId]);
  return res.rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    toolId: r.toolId,
    toolVersionId: r.toolVersionId,
    providerConnectionId: r.providerConnectionId,
    status: r.status,
    customSettings: r.customSettings || {},
    enabledScopes: r.enabledScopes || [],
    installedAt: r.installedAt,
    updatedAt: r.updatedAt,
    tool: r.tool ? {
      id: r.tool.id,
      slug: r.tool.slug,
      name: r.tool.name,
      category: r.tool.category,
      provider: r.tool.provider,
      toolType: r.tool.tool_type,
      description: r.tool.description,
      iconName: r.tool.icon_name,
      isVerified: r.tool.is_verified,
      isActive: r.tool.is_active,
      minPlanTier: r.tool.min_plan_tier,
      pricingModel: r.tool.pricing_model,
      costPerExecutionCents: r.tool.cost_per_execution_cents,
      createdAt: r.tool.created_at,
      updatedAt: r.tool.updated_at,
    } : undefined,
    connection: r.connection ? {
      id: r.connection.id,
      tenantId: r.connection.tenant_id,
      provider: r.connection.provider,
      connectionName: r.connection.connection_name,
      authType: r.connection.auth_type,
      status: r.connection.status,
      metadata: r.connection.metadata || {},
      lastVerifiedAt: r.connection.last_verified_at,
      createdAt: r.connection.created_at,
      updatedAt: r.connection.updated_at,
    } : undefined,
  }));
}

export async function installToolForTenant(params: {
  tenantId: string;
  toolId: string;
  toolVersionId?: string;
  providerConnectionId?: string;
  customSettings?: Record<string, unknown>;
  installedBy?: string;
}): Promise<TenantToolInstallation> {
  // Resolve active tool version if not specified
  let versionId = params.toolVersionId;
  if (!versionId) {
    const vRes = await query<{ id: string }>(
      'SELECT id FROM tool_versions WHERE tool_id = $1 AND status = \'active\' ORDER BY created_at DESC LIMIT 1',
      [params.toolId]
    );
    if (!vRes.rows[0]) {
      throw new Error('No active version available for this tool.');
    }
    versionId = vRes.rows[0].id;
  }

  // Fetch entitlement to determine max allowed active tools
  const entitlement = await EntitlementService.getEntitlement(params.tenantId);

  // Atomically insert only if active count does not exceed maxActiveTools
  const res = await query<any>(
    `INSERT INTO tenant_tool_installations (
      tenant_id, tool_id, tool_version_id, provider_connection_id, custom_settings, installed_by
    )
    SELECT $1, $2, $3, $4, $5, $6
    WHERE (
      SELECT count(*) FROM tenant_tool_installations
      WHERE tenant_id = $1 AND status = 'active' AND tool_id != $2
    ) < $7
    ON CONFLICT (tenant_id, tool_id) DO UPDATE SET 
      tool_version_id = EXCLUDED.tool_version_id,
      provider_connection_id = EXCLUDED.provider_connection_id,
      status = 'active',
      custom_settings = EXCLUDED.custom_settings,
      updated_at = NOW()
    RETURNING 
      id, tenant_id as "tenantId", tool_id as "toolId", 
      tool_version_id as "toolVersionId", provider_connection_id as "providerConnectionId",
      status, custom_settings as "customSettings", enabled_scopes as "enabledScopes",
      installed_at as "installedAt", updated_at as "updatedAt"`,
    [
      params.tenantId,
      params.toolId,
      versionId,
      params.providerConnectionId || null,
      JSON.stringify(params.customSettings || {}),
      params.installedBy || null,
      entitlement.maxActiveTools,
    ]
  );

  if (!res.rows[0]) {
    throw new EntitlementError(
      `[ENTITLEMENT] Active tool limit reached (${entitlement.maxActiveTools}/${entitlement.maxActiveTools}) for your plan tier. Upgrade plan to install more tools.`,
      'TOOL_LIMIT_REACHED'
    );
  }

  return res.rows[0];
}

export async function uninstallToolForTenant(tenantId: string, installationId: string): Promise<boolean> {
  const res = await query(
    'DELETE FROM tenant_tool_installations WHERE tenant_id = $1 AND id = $2',
    [tenantId, installationId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listAgentToolAssignments(tenantId: string, agentId: string): Promise<AgentToolAssignment[]> {
  const res = await query<any>(
    `SELECT 
      a.id, 
      a.tenant_id as "tenantId", 
      a.agent_id as "agentId", 
      a.tool_installation_id as "toolInstallationId", 
      a.is_enabled as "isEnabled", 
      a.allowed_capabilities as "allowedCapabilities", 
      a.override_parameters as "overrideParameters", 
      a.max_calls_per_session as "maxCallsPerSession", 
      a.created_at as "createdAt", 
      a.updated_at as "updatedAt",
      row_to_json(i.*) as installation
    FROM agent_tool_assignments a
    JOIN tenant_tool_installations i ON a.tool_installation_id = i.id
    WHERE a.tenant_id = $1 AND a.agent_id = $2
    ORDER BY a.created_at ASC`,
    [tenantId, agentId]
  );

  return res.rows;
}

export async function assignToolToAgent(params: {
  tenantId: string;
  agentId: string;
  toolInstallationId: string;
  allowedCapabilities?: string[];
  overrideParameters?: Record<string, unknown>;
  maxCallsPerSession?: number;
}): Promise<AgentToolAssignment> {
  const res = await query<any>(
    `INSERT INTO agent_tool_assignments (
      tenant_id, agent_id, tool_installation_id, allowed_capabilities, override_parameters, max_calls_per_session
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (tenant_id, agent_id, tool_installation_id) DO UPDATE SET
      is_enabled = true,
      allowed_capabilities = EXCLUDED.allowed_capabilities,
      override_parameters = EXCLUDED.override_parameters,
      max_calls_per_session = EXCLUDED.max_calls_per_session,
      updated_at = NOW()
    RETURNING 
      id, tenant_id as "tenantId", agent_id as "agentId", 
      tool_installation_id as "toolInstallationId", is_enabled as "isEnabled", 
      allowed_capabilities as "allowedCapabilities", override_parameters as "overrideParameters", 
      max_calls_per_session as "maxCallsPerSession", created_at as "createdAt", updated_at as "updatedAt"`,
    [
      params.tenantId,
      params.agentId,
      params.toolInstallationId,
      params.allowedCapabilities || null,
      JSON.stringify(params.overrideParameters || {}),
      params.maxCallsPerSession || 10,
    ]
  );

  return res.rows[0];
}

export async function removeAgentToolAssignment(tenantId: string, assignmentId: string): Promise<boolean> {
  const res = await query(
    'DELETE FROM agent_tool_assignments WHERE tenant_id = $1 AND id = $2',
    [tenantId, assignmentId]
  );
  return (res.rowCount ?? 0) > 0;
}
