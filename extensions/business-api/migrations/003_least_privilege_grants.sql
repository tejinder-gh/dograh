-- Migration: 003_least_privilege_grants.sql
-- Description: Grant schema and table permissions to business_app_user runtime role

-- Ensure business_app_user can access business_ext schema and tables
GRANT USAGE ON SCHEMA business_ext TO business_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA business_ext TO business_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA business_ext TO business_app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA business_ext GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO business_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA business_ext GRANT USAGE, SELECT ON SEQUENCES TO business_app_user;

-- Grant least-privilege read access to public schema for Dograh adapter queries
GRANT USAGE ON SCHEMA public TO business_app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO business_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO business_app_user;
