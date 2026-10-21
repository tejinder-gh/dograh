-- Migration: 002_tool_marketplace_schema.sql
-- Description: Multi-tenant Tool & Plugin Marketplace Schema with Entitlements, Connections, and Execution Gateway
-- Target Database: ai_calling_agent_os (PostgreSQL 15+ / Neon)

-- ============================================================================
-- 1. TOOL DEFINITIONS (Catalog of approved first-party, adapter, and MCP tools)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL CHECK (category IN (
        'scheduling',
        'crm',
        'communication',
        'payment',
        'verification',
        'knowledge_mcp',
        'operations'
    )),
    provider VARCHAR(100) NOT NULL,
    tool_type VARCHAR(50) NOT NULL CHECK (tool_type IN (
        'internal_function',
        'provider_adapter',
        'mcp_server'
    )),
    description TEXT NOT NULL,
    icon_name VARCHAR(100) NOT NULL DEFAULT 'Wrench',
    documentation_url TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_plan_tier VARCHAR(50) NOT NULL DEFAULT 'starter' CHECK (min_plan_tier IN ('starter', 'standard', 'growth', 'enterprise')),
    pricing_model VARCHAR(50) NOT NULL DEFAULT 'included' CHECK (pricing_model IN ('included', 'usage_based', 'add_on')),
    cost_per_execution_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_definitions_category ON tool_definitions(category);
CREATE INDEX IF NOT EXISTS idx_tool_definitions_slug ON tool_definitions(slug);
CREATE INDEX IF NOT EXISTS idx_tool_definitions_active ON tool_definitions(is_active);

-- ============================================================================
-- 2. TOOL VERSIONS (Semantic versioning & manifest definitions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id UUID NOT NULL REFERENCES tool_definitions(id) ON DELETE CASCADE,
    version_string VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN (
        'draft',
        'review_pending',
        'active',
        'deprecated',
        'revoked'
    )),
    changelog TEXT,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tool_id, version_string)
);

CREATE INDEX IF NOT EXISTS idx_tool_versions_tool ON tool_versions(tool_id, version_string);

-- ============================================================================
-- 3. TOOL CAPABILITIES (Discrete operations exposed to AI agents)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_version_id UUID NOT NULL REFERENCES tool_versions(id) ON DELETE CASCADE,
    function_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    risk_level VARCHAR(50) NOT NULL DEFAULT 'safe_read' CHECK (risk_level IN (
        'safe_read',
        'standard_write',
        'consequential_action',
        'critical_financial'
    )),
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    operation_type VARCHAR(50) NOT NULL DEFAULT 'read' CHECK (operation_type IN ('read', 'write', 'consequential')),
    input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    default_timeout_ms INTEGER NOT NULL DEFAULT 5000,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tool_version_id, function_name)
);

CREATE INDEX IF NOT EXISTS idx_tool_capabilities_version ON tool_capabilities(tool_version_id);
CREATE INDEX IF NOT EXISTS idx_tool_capabilities_fn ON tool_capabilities(function_name);

-- ============================================================================
-- 4. SUBSCRIPTION ENTITLEMENTS (Tenant quota & tier access rules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_tier VARCHAR(50) NOT NULL CHECK (plan_tier IN ('starter', 'standard', 'growth', 'enterprise')),
    allowed_categories TEXT[] DEFAULT ARRAY['scheduling', 'crm', 'communication', 'operations']::TEXT[],
    max_active_tools INTEGER NOT NULL DEFAULT 5,
    max_executions_per_month INTEGER NOT NULL DEFAULT 2000,
    current_cycle_executions INTEGER NOT NULL DEFAULT 0,
    billing_cycle_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    billing_cycle_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    is_suspended BOOLEAN NOT NULL DEFAULT false,
    overage_allowed BOOLEAN NOT NULL DEFAULT false,
    overage_rate_cents INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sub_entitlements_tenant UNIQUE (tenant_id),
    CONSTRAINT uq_subscription_entitlements_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_sub_entitlements_tenant ON subscription_entitlements(tenant_id);

-- ============================================================================
-- 5. TENANT PROVIDER CONNECTIONS (Isolated, encrypted external service credentials)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_provider_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL,
    connection_name VARCHAR(255) NOT NULL,
    auth_type VARCHAR(50) NOT NULL CHECK (auth_type IN (
        'oauth2',
        'api_key',
        'mcp_endpoint',
        'internal'
    )),
    status VARCHAR(50) NOT NULL DEFAULT 'connected' CHECK (status IN (
        'connected',
        'disconnected',
        'expired',
        'error',
        'pending_auth'
    )),
    encrypted_credentials TEXT,
    secret_key_ref VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_verified_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_connections_tenant_name UNIQUE (tenant_id, connection_name),
    CONSTRAINT uq_tenant_provider_connections_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_connections_tenant ON tenant_provider_connections(tenant_id);

-- ============================================================================
-- 6. TENANT TOOL INSTALLATIONS (Installed catalog tools per tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_tool_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tool_definitions(id) ON DELETE CASCADE,
    tool_version_id UUID NOT NULL REFERENCES tool_versions(id) ON DELETE RESTRICT,
    provider_connection_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN (
        'active',
        'disabled',
        'revoked',
        'pending_configuration'
    )),
    custom_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled_scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
    installed_by UUID REFERENCES users(id),
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_tool_inst_connection FOREIGN KEY (tenant_id, provider_connection_id) REFERENCES tenant_provider_connections(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_tenant_tool_installations UNIQUE (tenant_id, tool_id),
    CONSTRAINT uq_tenant_tool_installations_tenant_id UNIQUE (tenant_id, id)
);

CREATE OR REPLACE FUNCTION trg_unlink_provider_conn_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tenant_tool_installations
    SET provider_connection_id = NULL
    WHERE tenant_id = OLD.tenant_id AND provider_connection_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unlink_provider_conn ON tenant_provider_connections;
CREATE TRIGGER trg_unlink_provider_conn
BEFORE DELETE ON tenant_provider_connections
FOR EACH ROW EXECUTE FUNCTION trg_unlink_provider_conn_on_delete();

CREATE INDEX IF NOT EXISTS idx_tool_installations_tenant ON tenant_tool_installations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tool_installations_tool ON tenant_tool_installations(tool_id);

-- ============================================================================
-- 7. AGENT TOOL ASSIGNMENTS (Tool capabilities granted to specific agents)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_tool_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL,
    tool_installation_id UUID NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    allowed_capabilities TEXT[],
    override_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    max_calls_per_session INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_agent_assign_agent FOREIGN KEY (tenant_id, agent_id) REFERENCES agents(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_assign_installation FOREIGN KEY (tenant_id, tool_installation_id) REFERENCES tenant_tool_installations(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_agent_tool_assignment UNIQUE (tenant_id, agent_id, tool_installation_id),
    CONSTRAINT uq_agent_tool_assignments_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_assign_agent ON agent_tool_assignments(tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_assign_inst ON agent_tool_assignments(tenant_id, tool_installation_id);

-- ============================================================================
-- 8. TOOL EXECUTION POLICIES (Safety & Governance Rules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_execution_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tool_id UUID REFERENCES tool_definitions(id) ON DELETE CASCADE,
    capability_name VARCHAR(100),
    require_human_approval BOOLEAN NOT NULL DEFAULT false,
    approval_timeout_seconds INTEGER NOT NULL DEFAULT 300,
    allowed_call_directions TEXT[] DEFAULT ARRAY['inbound', 'outbound']::TEXT[],
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 30,
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    blocked_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tool_exec_policy UNIQUE (tenant_id, tool_id, capability_name),
    CONSTRAINT uq_tool_execution_policies_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tool_policies_tenant ON tool_execution_policies(tenant_id);

-- ============================================================================
-- 9. TOOL APPROVAL REQUESTS (Consequential Action Human-in-the-Loop)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id VARCHAR(100) NOT NULL,
    agent_id UUID,
    tool_name VARCHAR(100) NOT NULL,
    capability_name VARCHAR(100) NOT NULL,
    sanitized_arguments JSONB NOT NULL,
    encrypted_payload TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'approved',
        'executing',
        'executed',
        'failed',
        'rejected',
        'expired'
    )),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    execution_claimed_at TIMESTAMPTZ,
    execution_claimed_by UUID REFERENCES users(id),
    executed_at TIMESTAMPTZ,
    execution_result JSONB,
    CONSTRAINT uq_tool_approval_requests_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tool_approvals_tenant ON tool_approval_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tool_approvals_session ON tool_approval_requests(session_id);

-- ============================================================================
-- 10. TOOL EXECUTION LOGS (Authoritative Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id VARCHAR(100) NOT NULL,
    agent_id UUID,
    tool_name VARCHAR(100) NOT NULL,
    capability_name VARCHAR(100) NOT NULL,
    execution_source VARCHAR(50) NOT NULL DEFAULT 'voice_agent' CHECK (execution_source IN (
        'voice_agent',
        'test_runner',
        'workflow',
        'manual_trigger'
    )),
    status VARCHAR(50) NOT NULL CHECK (status IN (
        'executing',
        'success',
        'failed',
        'blocked_entitlement',
        'blocked_policy',
        'timeout',
        'rejected_approval',
        'circuit_broken'
    )),
    duration_ms INTEGER NOT NULL DEFAULT 0,
    sanitized_input JSONB NOT NULL,
    sanitized_output JSONB,
    error_message TEXT,
    idempotency_key VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_exec_logs_tenant ON tool_execution_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_exec_logs_session ON tool_execution_logs(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_logs_status ON tool_execution_logs(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_exec_logs_tenant_idempotency ON tool_execution_logs(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- 11. TOOL USAGE RECORDS (Metering & Billing Ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID,
    tool_id UUID NOT NULL REFERENCES tool_definitions(id) ON DELETE CASCADE,
    billing_period VARCHAR(20) NOT NULL,
    units_consumed INTEGER NOT NULL DEFAULT 1,
    cost_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_usage_tenant ON tool_usage_records(tenant_id, billing_period);
CREATE INDEX IF NOT EXISTS idx_tool_usage_tool ON tool_usage_records(tenant_id, tool_id);

-- ============================================================================
-- 12. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE subscription_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_entitlements FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_provider_connections FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_tool_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_tool_installations FORCE ROW LEVEL SECURITY;

ALTER TABLE agent_tool_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_assignments FORCE ROW LEVEL SECURITY;

ALTER TABLE tool_execution_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_execution_policies FORCE ROW LEVEL SECURITY;

ALTER TABLE tool_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_approval_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE tool_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_execution_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE tool_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_usage_records FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
    tbls text[] := ARRAY[
        'subscription_entitlements',
        'tenant_provider_connections',
        'tenant_tool_installations',
        'agent_tool_assignments',
        'tool_execution_policies',
        'tool_approval_requests',
        'tool_execution_logs',
        'tool_usage_records'
    ];
BEGIN
    FOREACH tbl IN ARRAY tbls LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_tenant_isolation', tbl);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::UUID)',
            tbl || '_tenant_isolation',
            tbl
        );
    END LOOP;
END $$;
