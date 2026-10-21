-- Migration Down: 001_initial_schema_down.sql
-- Description: Revert multi-tenant architecture for AI Calling Agent OS

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS rag_chunks CASCADE;
DROP TABLE IF EXISTS rag_documents CASCADE;
DROP TABLE IF EXISTS escalation_tickets CASCADE;
DROP TABLE IF EXISTS escalation_personnel CASCADE;
DROP TABLE IF EXISTS interactions CASCADE;
DROP TABLE IF EXISTS scheduled_sessions CASCADE;
DROP TABLE IF EXISTS representatives CASCADE;
DROP TABLE IF EXISTS lead_timeline_events CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS prompt_versions CASCADE;
DROP TABLE IF EXISTS prompt_templates CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS business_profiles CASCADE;
DROP TABLE IF EXISTS tenant_users CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
