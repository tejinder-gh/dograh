-- Migration: 001_initial_schema.sql
-- Description: Core multi-tenant architecture with composite tenant FKs & Row-Level Security (RLS)
-- Target Database: ai_calling_agent_os (PostgreSQL 15+ / Neon)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TENANTS & ORGANIZATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    industry VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial', 'pending_onboarding')),
    tier VARCHAR(50) NOT NULL DEFAULT 'standard' CHECK (tier IN ('starter', 'standard', 'growth', 'enterprise')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- ============================================================================
-- 2. USERS & RBAC MEMBERSHIP
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    is_platform_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN (
        'platform_super_admin',
        'platform_operations',
        'tenant_owner',
        'tenant_administrator',
        'tenant_agent_manager',
        'tenant_staff',
        'tenant_analyst'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);

-- ============================================================================
-- 3. BUSINESS PROFILES & DOMAINS
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    industry VARCHAR(100) NOT NULL DEFAULT 'general',
    description TEXT,
    brand_tone VARCHAR(100) NOT NULL DEFAULT 'Professional and empathetic',
    website_url VARCHAR(500),
    operating_hours JSONB DEFAULT '{"timezone":"America/New_York","schedule":{}}'::jsonb,
    knowledge_base_snippets JSONB DEFAULT '[]'::jsonb,
    custom_attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, domain),
    CONSTRAINT uq_business_profiles_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_tenant ON business_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_domain ON business_profiles(domain);

-- ============================================================================
-- 4. AGENTS & AGENT CONFIGURATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_profile_id UUID,
    name VARCHAR(100) NOT NULL,
    persona TEXT NOT NULL,
    voice_id VARCHAR(50) NOT NULL DEFAULT 'Kore',
    language VARCHAR(20) NOT NULL DEFAULT 'en-US',
    inbound_goal TEXT NOT NULL,
    inbound_calendar_link TEXT,
    inbound_rep_id UUID,
    outbound_goal TEXT NOT NULL,
    outbound_calendar_link TEXT,
    outbound_rep_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    telephony_config JSONB DEFAULT '{
        "provider": "webrtc",
        "callerIdNumber": "+1 (800) 555-0199",
        "codecs": ["Opus", "G.711u", "G.711a"],
        "maxConcurrentLines": 10
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_agents_business_profile FOREIGN KEY (tenant_id, business_profile_id) REFERENCES business_profiles(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_agents_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);

-- ============================================================================
-- 5. DATABASE-DRIVEN PROMPT ENGINE & PROMPT VERSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID,
    layer VARCHAR(50) NOT NULL CHECK (layer IN (
        'safety_policy',
        'platform_master',
        'industry_template',
        'tenant_custom',
        'agent_persona',
        'workflow_inbound',
        'workflow_outbound',
        'channel_override'
    )),
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_prompt_templates_tenant_id UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_template_id UUID NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    prompt_text TEXT NOT NULL,
    change_summary TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT true,
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(prompt_template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_tenant ON prompt_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_template ON prompt_versions(prompt_template_id);

-- ============================================================================
-- 6. CONTACTS & LEADS (Preserve unknown/null values, no fabricated CRM facts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    role VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    avatar TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'nurturing', 'booked', 'closed')),
    lifecycle_status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (lifecycle_status IN (
        'new', 'queued_outbound', 'calling', 'connected', 'qualified', 'booked', 'escalated', 'failed_retry', 'closed'
    )),
    lead_score INTEGER CHECK (lead_score >= 0 AND lead_score <= 100),
    estimated_value VARCHAR(100),
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    notes TEXT DEFAULT '',
    bant JSONB,
    call_attempts INTEGER NOT NULL DEFAULT 0,
    last_call_result VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_contacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contacts_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle ON contacts(tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(tenant_id, lead_score DESC NULLS LAST);

-- ============================================================================
-- 7. LEAD AUDIT TIMELINE (Composite FK to contacts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL,
    event VARCHAR(255) NOT NULL,
    details TEXT,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_lead_timeline_contact FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_timeline_contact ON lead_timeline_events(tenant_id, contact_id, created_at DESC);

-- ============================================================================
-- 8. REPRESENTATIVES & STAFF
-- ============================================================================
CREATE TABLE IF NOT EXISTS representatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    specialization TEXT,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    avatar TEXT,
    available_days TEXT[] DEFAULT ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']::TEXT[],
    available_slots TEXT[] DEFAULT ARRAY['09:00 AM', '11:00 AM', '02:00 PM', '04:00 PM']::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_representatives_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_reps_tenant ON representatives(tenant_id);

-- ============================================================================
-- 9. BOOKED SESSIONS & APPOINTMENTS (Composite FKs & Double-Booking Prevention)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL,
    representative_id UUID,
    date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    meeting_type VARCHAR(100) NOT NULL DEFAULT '30-min Discovery',
    status VARCHAR(50) NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN (
        'pending_confirmation', 'confirmed', 'rescheduled', 'completed', 'cancelled'
    )),
    agenda_notes TEXT,
    calendar_invite_sent BOOLEAN NOT NULL DEFAULT false,
    external_calendar_event_id TEXT,
    external_calendar_link TEXT,
    idempotency_key VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_scheduled_sessions_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_sessions_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_sessions_contact FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_representative FOREIGN KEY (tenant_id, representative_id) REFERENCES representatives(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON scheduled_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_contact ON scheduled_sessions(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON scheduled_sessions(tenant_id, date);

-- DB-Level Conflict Prevention: No double-booking for the same representative and slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_no_double_book ON scheduled_sessions (
    tenant_id, representative_id, date, time_slot
) WHERE status IN ('confirmed', 'pending_confirmation');

-- ============================================================================
-- 10. INTERACTIONS & CALL LOGS (Composite FKs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID,
    agent_id UUID,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('call_inbound', 'call_outbound', 'sms', 'whatsapp', 'webchat')),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    sentiment_score INTEGER NOT NULL DEFAULT 50 CHECK (sentiment_score >= -100 AND sentiment_score <= 100),
    sentiment_category VARCHAR(50) NOT NULL CHECK (sentiment_category IN ('positive', 'neutral', 'frustrated', 'critical')),
    was_escalated BOOLEAN NOT NULL DEFAULT false,
    escalation_reason TEXT,
    summary TEXT,
    raw_transcript JSONB DEFAULT '[]'::jsonb,
    prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    booked_session_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_interactions_contact FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_interactions_agent FOREIGN KEY (tenant_id, agent_id) REFERENCES agents(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_interactions_session FOREIGN KEY (tenant_id, booked_session_id) REFERENCES scheduled_sessions(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_interactions_tenant ON interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_channel ON interactions(tenant_id, channel);

-- ============================================================================
-- 11. ESCALATION TICKETS & PERSONNEL (Composite FKs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS escalation_personnel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'Tier 1 Support Lead' CHECK (tier IN ('Tier 1 Support Lead', 'Tier 2 Technical Architect', 'Tier 3 Executive On-Call')),
    channels TEXT[] DEFAULT ARRAY['sms', 'call']::TEXT[],
    active_on_call BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_escalation_personnel_tenant_id UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS escalation_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID,
    interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL,
    urgency_level VARCHAR(50) NOT NULL DEFAULT 'high' CHECK (urgency_level IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved')),
    sentiment_score INTEGER NOT NULL DEFAULT -50,
    trigger_reason TEXT NOT NULL,
    supervisor_notes TEXT,
    sla_minutes_remaining INTEGER NOT NULL DEFAULT 15,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT fk_escalation_contact FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_escalation_tickets_tenant ON escalation_tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_escalation_personnel_tenant ON escalation_personnel(tenant_id);

-- ============================================================================
-- 12. STRICT RAG DOCUMENTS & CHUNKS (Composite FKs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_size VARCHAR(50),
    mime_type VARCHAR(100),
    chunk_count INTEGER NOT NULL DEFAULT 0,
    extracted_content TEXT,
    policy_rules TEXT[] DEFAULT ARRAY[]::TEXT[],
    approval_status VARCHAR(50) NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending_review', 'approved', 'rejected', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rag_documents_tenant_id UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    section VARCHAR(100),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_rag_chunks_document FOREIGN KEY (tenant_id, document_id) REFERENCES rag_documents(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rag_documents_tenant ON rag_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(tenant_id, document_id);

-- ============================================================================
-- 13. AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    diff JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);

-- ============================================================================
-- 14. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable AND FORCE Row-Level Security so table owners and application roles strictly adhere to RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;

ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates FORCE ROW LEVEL SECURITY;

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

ALTER TABLE lead_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_timeline_events FORCE ROW LEVEL SECURITY;

ALTER TABLE representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE representatives FORCE ROW LEVEL SECURITY;

ALTER TABLE scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions FORCE ROW LEVEL SECURITY;

ALTER TABLE escalation_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_personnel FORCE ROW LEVEL SECURITY;

ALTER TABLE escalation_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_tickets FORCE ROW LEVEL SECURITY;

ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_documents FORCE ROW LEVEL SECURITY;

ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Tenants policy: Accessible by explicit tenant context, user's assigned membership, or trusted system context
DROP POLICY IF EXISTS tenant_self_policy ON tenants;
CREATE POLICY tenant_self_policy ON tenants
    FOR ALL
    USING (
        current_setting('app.is_system_bypass', true) = 'true'
        OR id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
        OR id IN (
            SELECT tenant_id FROM tenant_users 
            WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
        )
    );

-- Tenant Users policy: Accessible by tenant context, individual user during login, or trusted system context
DROP POLICY IF EXISTS tenant_users_policy ON tenant_users;
CREATE POLICY tenant_users_policy ON tenant_users
    FOR ALL
    USING (
        current_setting('app.is_system_bypass', true) = 'true'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
        OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    );

-- Strict tenant isolation policy for all domain, CRM, session, and audit tables:
-- Requires explicit transaction-bound app.current_tenant_id or trusted system context.
DO $$
DECLARE
    tbl text;
    tbls text[] := ARRAY[
        'business_profiles',
        'agents',
        'prompt_templates',
        'contacts',
        'lead_timeline_events',
        'representatives',
        'scheduled_sessions',
        'interactions',
        'escalation_personnel',
        'escalation_tickets',
        'rag_documents',
        'rag_chunks',
        'audit_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tbls LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_tenant_isolation', tbl);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (
                current_setting(''app.is_system_bypass'', true) = ''true''
                OR tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::UUID
            )',
            tbl || '_tenant_isolation',
            tbl
        );
    END LOOP;
END $$;


