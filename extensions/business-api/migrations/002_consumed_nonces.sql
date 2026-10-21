-- Migration: 002_consumed_nonces.sql
-- Description: Atomic shared replay prevention table for internal assertions across multi-worker deployments

CREATE TABLE IF NOT EXISTS business_ext.consumed_nonces (
    nonce VARCHAR(128) PRIMARY KEY,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consumed_nonces_expires 
    ON business_ext.consumed_nonces(expires_at);

-- Grant DML to unprivileged application runtime role
GRANT SELECT, INSERT, UPDATE, DELETE ON business_ext.consumed_nonces TO business_app_user;
