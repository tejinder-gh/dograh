-- Migration: 001_business_ext_init.sql
-- Description: Isolated business extension schema for AI Calling Agent OS on Dograh
-- Target Schema: business_ext (Co-located in Dograh PostgreSQL, strictly isolated)

CREATE SCHEMA IF NOT EXISTS business_ext;

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. DURABLE ORGANIZATION MAPPINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_ext.organization_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id VARCHAR(100) NOT NULL DEFAULT 'default',
    dograh_organization_id INTEGER NOT NULL,
    business_tenant_id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_deployment_org UNIQUE (deployment_id, dograh_organization_id),
    CONSTRAINT uq_business_tenant UNIQUE (business_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_org_mappings_lookup 
    ON business_ext.organization_mappings(deployment_id, dograh_organization_id);
CREATE INDEX IF NOT EXISTS idx_org_mappings_tenant 
    ON business_ext.organization_mappings(business_tenant_id);

-- ============================================================================
-- 2. BUSINESS PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_ext.business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES business_ext.organization_mappings(business_tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    industry VARCHAR(100) NOT NULL DEFAULT 'general',
    description TEXT NOT NULL DEFAULT '',
    brand_tone VARCHAR(100) NOT NULL DEFAULT 'Professional and empathetic',
    website_url VARCHAR(500),
    inbound_goal TEXT NOT NULL DEFAULT 'Resolve customer inquiries and qualify needs.',
    outbound_goal TEXT NOT NULL DEFAULT 'Assess prospect fit and schedule a consultation.',
    operating_hours JSONB NOT NULL DEFAULT '{"timezone":"America/New_York","schedule":{}}'::jsonb,
    knowledge_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    escalation_preferences JSONB NOT NULL DEFAULT '{"supervisorEmail":"","urgencyThreshold":"high"}'::jsonb,
    dograh_workflow_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_business_profiles_tenant_domain UNIQUE (tenant_id, domain),
    CONSTRAINT uq_business_profiles_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_tenant 
    ON business_ext.business_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_domain 
    ON business_ext.business_profiles(tenant_id, domain);

-- ============================================================================
-- 3. CRM CONTACTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_ext.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES business_ext.organization_mappings(business_tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    role VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    avatar TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'new' 
        CHECK (status IN ('new', 'contacted', 'qualified', 'nurturing', 'booked', 'closed')),
    lifecycle_status VARCHAR(50) NOT NULL DEFAULT 'new' 
        CHECK (lifecycle_status IN ('new', 'queued_outbound', 'calling', 'connected', 'qualified', 'booked', 'escalated', 'failed_retry', 'closed')),
    lead_score INTEGER CHECK (lead_score >= 0 AND lead_score <= 100),
    estimated_value VARCHAR(100),
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    notes TEXT NOT NULL DEFAULT '',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    call_attempts INTEGER NOT NULL DEFAULT 0,
    last_call_result VARCHAR(50),
    last_contacted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contacts_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant 
    ON business_ext.contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email 
    ON business_ext.contacts(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone 
    ON business_ext.contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle 
    ON business_ext.contacts(tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_contacts_score 
    ON business_ext.contacts(tenant_id, lead_score DESC NULLS LAST);

-- ============================================================================
-- 4. LEAD AUDIT TIMELINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_ext.contact_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    event VARCHAR(255) NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_timeline_contact 
        FOREIGN KEY (tenant_id, contact_id) 
        REFERENCES business_ext.contacts(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contact_timeline 
    ON business_ext.contact_timeline_events(tenant_id, contact_id, created_at DESC);

-- ============================================================================
-- 5. INTERACTIONS (Correlated with Dograh Workflow Runs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_ext.interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES business_ext.organization_mappings(business_tenant_id) ON DELETE CASCADE,
    contact_id UUID,
    dograh_workflow_id INTEGER,
    dograh_definition_id INTEGER,
    dograh_run_id VARCHAR(255),
    channel VARCHAR(50) NOT NULL DEFAULT 'call_inbound' 
        CHECK (channel IN ('call_inbound', 'call_outbound', 'sms', 'whatsapp', 'webchat')),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    sentiment_score INTEGER NOT NULL DEFAULT 50 
        CHECK (sentiment_score >= -100 AND sentiment_score <= 100),
    sentiment_category VARCHAR(50) NOT NULL DEFAULT 'neutral' 
        CHECK (sentiment_category IN ('positive', 'neutral', 'frustrated', 'critical')),
    was_escalated BOOLEAN NOT NULL DEFAULT false,
    escalation_reason TEXT,
    summary TEXT NOT NULL DEFAULT '',
    transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_interactions_contact 
        FOREIGN KEY (tenant_id, contact_id) 
        REFERENCES business_ext.contacts(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_interactions_tenant 
    ON business_ext.interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_interactions_contact 
    ON business_ext.interactions(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created 
    ON business_ext.interactions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_dograh_run 
    ON business_ext.interactions(tenant_id, dograh_run_id);
