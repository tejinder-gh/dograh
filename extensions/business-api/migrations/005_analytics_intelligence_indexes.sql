-- Migration: 005_analytics_intelligence_indexes.sql
-- Description: Composite query performance indexes for CRM analytics and appointment run correlation

-- Ensure acuity_run_id exists on appointments if created by prior revisions
ALTER TABLE business_ext.appointments
    ADD COLUMN IF NOT EXISTS acuity_run_id VARCHAR(255);

-- Performance index for lead lifecycle filtering ordered by creation time
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_lifecycle
    ON business_ext.contacts(tenant_id, lifecycle_status, created_at DESC);

-- Performance index for interaction activity timeline ordering
CREATE INDEX IF NOT EXISTS idx_interactions_tenant_created
    ON business_ext.interactions(tenant_id, created_at DESC);

-- Performance indexes for appointment querying and call run correlation
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_time
    ON business_ext.appointments(tenant_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status
    ON business_ext.appointments(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_appointments_run
    ON business_ext.appointments(tenant_id, acuity_run_id);
