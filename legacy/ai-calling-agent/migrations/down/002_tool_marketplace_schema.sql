-- Down Migration: 002_tool_marketplace_schema.sql
-- Description: Cleanly drops multi-tenant tool marketplace tables in reverse dependency order

DROP TABLE IF EXISTS tool_usage_records CASCADE;
DROP TABLE IF EXISTS tool_execution_logs CASCADE;
DROP TABLE IF EXISTS tool_approval_requests CASCADE;
DROP TABLE IF EXISTS tool_execution_policies CASCADE;
DROP TABLE IF EXISTS agent_tool_assignments CASCADE;
DROP TABLE IF EXISTS tenant_tool_installations CASCADE;
DROP TABLE IF EXISTS tenant_provider_connections CASCADE;
DROP TABLE IF EXISTS subscription_entitlements CASCADE;
DROP TABLE IF EXISTS tool_capabilities CASCADE;
DROP TABLE IF EXISTS tool_versions CASCADE;
DROP TABLE IF EXISTS tool_definitions CASCADE;
