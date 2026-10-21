-- Migration: 004_appointments.sql
-- Description: Appointments table for CRM calendar scheduling and analytics

CREATE TABLE IF NOT EXISTS business_ext.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES business_ext.organization_mappings(business_tenant_id) ON DELETE CASCADE,
    contact_id UUID REFERENCES business_ext.contacts(id) ON DELETE SET NULL,
    acuity_workflow_id INTEGER,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'agent'
        CHECK (source IN ('agent', 'manual', 'web')),
    resulting_deal_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant
    ON business_ext.appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact
    ON business_ext.appointments(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time
    ON business_ext.appointments(tenant_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status
    ON business_ext.appointments(tenant_id, status);

-- Least privilege grants for runtime role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_ext.appointments TO business_app_user;
