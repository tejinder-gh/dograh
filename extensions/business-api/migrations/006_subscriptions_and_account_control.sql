-- Migration: 006_subscriptions_and_account_control.sql
-- Description: Multi-tenant subscription plans, organization subscriptions, and auditable account control logs
-- Target Schema: business_ext (Strictly isolated in Neon PostgreSQL)

-- ============================================================================
-- 1. SUBSCRIPTION PLANS CATALOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_ext.subscription_plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'usd',
    included_voice_minutes INTEGER NOT NULL,
    additional_minute_rate_cents INTEGER NOT NULL,
    max_concurrent_calls INTEGER NOT NULL DEFAULT 2,
    max_voice_agents INTEGER NOT NULL DEFAULT 3,
    supports_byok BOOLEAN NOT NULL DEFAULT false,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Canonical Subscription Plans for Skill Corner Voice OS
INSERT INTO business_ext.subscription_plans 
(id, name, description, price_cents, currency, included_voice_minutes, additional_minute_rate_cents, max_concurrent_calls, max_voice_agents, supports_byok, features)
VALUES 
(
    'starter', 
    'Starter Plan', 
    'Essential voice agent coverage for small businesses and single practice locations.', 
    9900, 
    'usd', 
    250, 
    22, 
    2, 
    3, 
    false, 
    '["250 Voice Minutes Included", "2 Concurrent Inbound/Outbound Lines", "3 Active Voice Agent Workflows", "Core CRM Contact Management", "Automated Call Summary & Sentiment"]'::jsonb
),
(
    'professional', 
    'Professional Plan', 
    'High-volume voice automation with custom telephony connections and BYOK models.', 
    29900, 
    'usd', 
    1000, 
    18, 
    5, 
    10, 
    true, 
    '["1,000 Voice Minutes Included", "5 Concurrent Lines", "10 Active Voice Agent Workflows", "BYOK Custom LLM & TTS Integration", "Twilio & SIP Trunk Routing", "Advanced Webhook Automations & Export"]'::jsonb
),
(
    'enterprise', 
    'Enterprise Plan', 
    'Full-scale automated calling infrastructure with dedicated trunking and priority routing.', 
    79900, 
    'usd', 
    3500, 
    14, 
    20, 
    100, 
    true, 
    '["3,500 Voice Minutes Included", "20 Concurrent Lines", "Unlimited Voice Agent Workflows", "Dedicated Carrier Interconnect / Custom SIP", "Priority Pipeline SLA & Webhook Relay", "Multi-Seat Operator Collaboration"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    included_voice_minutes = EXCLUDED.included_voice_minutes,
    additional_minute_rate_cents = EXCLUDED.additional_minute_rate_cents,
    max_concurrent_calls = EXCLUDED.max_concurrent_calls,
    max_voice_agents = EXCLUDED.max_voice_agents,
    supports_byok = EXCLUDED.supports_byok,
    features = EXCLUDED.features;

-- ============================================================================
-- 2. CLIENT ORGANIZATION SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_ext.organization_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES business_ext.organization_mappings(business_tenant_id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES business_ext.subscription_plans(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')),
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'month'
        CHECK (billing_interval IN ('month', 'year', 'custom')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
    included_minutes INTEGER NOT NULL,
    bonus_minutes INTEGER NOT NULL DEFAULT 0,
    concurrency_limit INTEGER NOT NULL DEFAULT 2,
    custom_rate_cents INTEGER,
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_org_subscriptions_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_tenant
    ON business_ext.organization_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_plan
    ON business_ext.organization_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status
    ON business_ext.organization_subscriptions(status);

-- Seed default starter subscriptions for all existing organization mappings
INSERT INTO business_ext.organization_subscriptions
(tenant_id, plan_id, status, billing_interval, current_period_start, current_period_end, included_minutes, concurrency_limit)
SELECT 
    om.business_tenant_id,
    'starter',
    'active',
    'month',
    NOW(),
    NOW() + INTERVAL '1 month',
    250,
    2
FROM business_ext.organization_mappings om
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- 3. AUDITABLE ACCOUNT CONTROL LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_ext.account_control_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES business_ext.organization_mappings(business_tenant_id) ON DELETE CASCADE,
    admin_user_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    previous_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_control_logs_tenant
    ON business_ext.account_control_logs(tenant_id, created_at DESC);

-- ============================================================================
-- 4. RUNTIME GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA business_ext TO business_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA business_ext TO business_app_user;
