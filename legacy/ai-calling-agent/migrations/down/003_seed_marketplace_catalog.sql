-- Down Migration: 003_seed_marketplace_catalog.sql
-- Description: Removes default seeded catalog tools

DELETE FROM tool_definitions WHERE slug IN (
    'google-calendar-scheduling',
    'crm-lead-synchronizer',
    'twilio-sms-telephony',
    'stripe-instant-billing',
    'supervisor-live-escalation',
    'postgres-mcp-connector',
    'web-grounding-mcp'
);
