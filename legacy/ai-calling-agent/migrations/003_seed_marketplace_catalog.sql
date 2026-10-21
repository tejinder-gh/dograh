-- Migration: 003_seed_marketplace_catalog.sql
-- Description: Seed verified first-party tools, native provider adapters, and vetted MCP servers into the catalog

-- 1. Google Calendar Scheduling
INSERT INTO tool_definitions (
    id, slug, name, category, provider, tool_type, description, icon_name, is_verified, is_active, min_plan_tier, pricing_model, cost_per_execution_cents
) VALUES (
    'a1000000-0000-0000-0000-000000000001',
    'google-calendar-scheduling',
    'Google Calendar & Scheduling',
    'scheduling',
    'google_workspace',
    'provider_adapter',
    'Authoritative multi-tenant calendar availability search, automated meeting scheduling, and conflict-free booking confirmation.',
    'Calendar',
    false,
    false,
    'starter',
    'included',
    0
) ON CONFLICT (slug) DO NOTHING;

-- 2. CRM Sync & Lead Qualification
INSERT INTO tool_definitions (
    id, slug, name, category, provider, tool_type, description, icon_name, is_verified, is_active, min_plan_tier, pricing_model, cost_per_execution_cents
) VALUES (
    'a1000000-0000-0000-0000-000000000002',
    'crm-lead-synchronizer',
    'CRM & Lead Synchronizer',
    'crm',
    'salesforce',
    'provider_adapter',
    'Real-time bi-directional contact synchronization, BANT lead qualification tagging, and call summary logging to Salesforce and HubSpot.',
    'Users',
    false,
    false,
    'starter',
    'included',
    0
) ON CONFLICT (slug) DO NOTHING;

-- 3. Twilio SMS & OTP Verification
INSERT INTO tool_definitions (
    id, slug, name, category, provider, tool_type, description, icon_name, is_verified, is_active, min_plan_tier, pricing_model, cost_per_execution_cents
) VALUES (
    'a1000000-0000-0000-0000-000000000003',
    'twilio-sms-telephony',
    'Twilio SMS & OTP Dispatch',
    'communication',
    'twilio',
    'provider_adapter',
    'Instant SMS confirmation dispatch, follow-up links, two-factor OTP verification during voice calls, and delivery status tracking.',
    'MessageSquare',
    false,
    false,
    'standard',
    'usage_based',
    2
) ON CONFLICT (slug) DO NOTHING;

-- 4. Stripe Instant Payment & Checkout
INSERT INTO tool_definitions (
    id, slug, name, category, provider, tool_type, description, icon_name, is_verified, is_active, min_plan_tier, pricing_model, cost_per_execution_cents
) VALUES (
    'a1000000-0000-0000-0000-000000000004',
    'stripe-instant-billing',
    'Stripe Checkout & Billing',
    'payment',
    'stripe',
    'provider_adapter',
    'Secure on-call payment link generation, invoice verification, deposit authorization, and PCI-compliant transaction logging.',
    'CreditCard',
    false,
    false,
    'growth',
    'usage_based',
    10
) ON CONFLICT (slug) DO NOTHING;

-- 5. Human Supervisor Live Transfer & Escalation (Internal First-Party Function)
INSERT INTO tool_definitions (
    id, slug, name, category, provider, tool_type, description, icon_name, is_verified, is_active, min_plan_tier, pricing_model, cost_per_execution_cents
) VALUES (
    'a1000000-0000-0000-0000-000000000005',
    'supervisor-live-escalation',
    'Supervisor Live Transfer Gate',
    'operations',
    'internal',
    'internal_function',
    'Immediate SIP/WebRTC call transfer to on-call human specialists, SLA tracking, urgency grading, and live emergency escalation.',
    'ShieldAlert',
    true,
    true,
    'starter',
    'included',
    0
) ON CONFLICT (slug) DO NOTHING;

-- 6. Postgres Database MCP Server (Vetted Model Context Protocol)
INSERT INTO tool_definitions (
    id, slug, name, category, provider, tool_type, description, icon_name, is_verified, is_active, min_plan_tier, pricing_model, cost_per_execution_cents
) VALUES (
    'a1000000-0000-0000-0000-000000000006',
    'postgres-mcp-connector',
    'Postgres Enterprise MCP Gateway',
    'knowledge_mcp',
    'anthropic_mcp',
    'mcp_server',
    'Isolated Model Context Protocol (MCP) server integration for querying internal PostgreSQL knowledge tables and product inventory catalogs.',
    'Database',
    false,
    false,
    'enterprise',
    'usage_based',
    5
) ON CONFLICT (slug) DO NOTHING;

-- 7. Web Search Grounding & Fact Verification MCP
INSERT INTO tool_definitions (
    id, slug, name, category, provider, tool_type, description, icon_name, is_verified, is_active, min_plan_tier, pricing_model, cost_per_execution_cents
) VALUES (
    'a1000000-0000-0000-0000-000000000007',
    'web-grounding-mcp',
    'Real-Time Web Grounding MCP',
    'knowledge_mcp',
    'anthropic_mcp',
    'mcp_server',
    'Real-time search verification MCP server for fact-checking pricing, policies, and market data without LLM hallucination.',
    'Search',
    false,
    false,
    'standard',
    'usage_based',
    3
) ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- TOOL VERSIONS (v1.0.0 for all initial tools)
-- ============================================================================
INSERT INTO tool_versions (id, tool_id, version_string, status, changelog, manifest) VALUES
(
    'b1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    '1.0.0',
    'review_pending',
    'Initial release of Google Calendar provider adapter. Awaiting tenant provider connection verification.',
    '{"scopes": ["calendar.readonly", "calendar.events.write"], "authRequirements": ["oauth2_or_service_account"]}'::jsonb
),
(
    'b1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002',
    '1.0.0',
    'review_pending',
    'Initial release of CRM synchronizer. Awaiting tenant provider connection verification.',
    '{"scopes": ["contacts.read", "contacts.write"], "authRequirements": ["api_key"]}'::jsonb
),
(
    'b1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000003',
    '1.0.0',
    'review_pending',
    'Twilio SMS dispatch adapter. Awaiting tenant telephony credentials verification.',
    '{"scopes": ["messages.send"], "authRequirements": ["account_sid_and_auth_token"]}'::jsonb
),
(
    'b1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000004',
    '1.0.0',
    'review_pending',
    'Stripe Checkout Session generator. Awaiting live restricted key verification.',
    '{"scopes": ["payment_links.write"], "authRequirements": ["restricted_api_key"]}'::jsonb
),
(
    'b1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000005',
    '1.0.0',
    'active',
    'Supervisor live transfer with emergency SLA routing and on-call paging (internal function).',
    '{"scopes": ["internal.escalation"], "authRequirements": ["platform_internal"]}'::jsonb
),
(
    'b1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000006',
    '1.0.0',
    'review_pending',
    'Sandboxed MCP server endpoint. Awaiting verified MCP server endpoint and bearer token.',
    '{"scopes": ["mcp.tools.call"], "authRequirements": ["mcp_endpoint_url_and_bearer"]}'::jsonb
),
(
    'b1000000-0000-0000-0000-000000000007',
    'a1000000-0000-0000-0000-000000000007',
    '1.0.0',
    'review_pending',
    'Real-time search MCP client. Awaiting verified search provider API credentials.',
    '{"scopes": ["mcp.tools.call"], "authRequirements": ["search_api_key"]}'::jsonb
) ON CONFLICT (tool_id, version_string) DO NOTHING;

-- ============================================================================
-- TOOL CAPABILITIES (Specific callable functions exposed to models)
-- ============================================================================

-- 1. Google Calendar Capabilities
INSERT INTO tool_capabilities (
    id, tool_version_id, function_name, display_name, description, risk_level, requires_approval, operation_type, input_schema, output_schema
) VALUES
(
    'c1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'check_calendar_availability',
    'Check Available Slots',
    'Queries available appointment windows for a given date or range.',
    'safe_read',
    false,
    'read',
    '{"type": "object", "properties": {"date": {"type": "string", "description": "Date in YYYY-MM-DD format"}, "preferred_slot": {"type": "string"}}, "required": ["date"]}'::jsonb,
    '{"type": "object", "properties": {"available_slots": {"type": "array"}}}'::jsonb
),
(
    'c1000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000001',
    'book_calendar_appointment',
    'Book Confirmed Session',
    'Reserves a specific time slot on the representative calendar with idempotency guarantee.',
    'standard_write',
    false,
    'write',
    '{"type": "object", "properties": {"date": {"type": "string"}, "timeSlot": {"type": "string"}, "contactId": {"type": "string"}, "notes": {"type": "string"}}, "required": ["date", "timeSlot"]}'::jsonb,
    '{"type": "object", "properties": {"bookingId": {"type": "string"}, "confirmed": {"type": "boolean"}}}'::jsonb
) ON CONFLICT (tool_version_id, function_name) DO NOTHING;

-- 2. CRM Capabilities
INSERT INTO tool_capabilities (
    id, tool_version_id, function_name, display_name, description, risk_level, requires_approval, operation_type, input_schema, output_schema
) VALUES
(
    'c1000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000002',
    'lookup_contact_crm',
    'Lookup Contact in CRM',
    'Fetches existing CRM history, open opportunities, and recent activity notes for a caller.',
    'safe_read',
    false,
    'read',
    '{"type": "object", "properties": {"phone": {"type": "string"}, "email": {"type": "string"}}}'::jsonb,
    '{"type": "object", "properties": {"contact": {"type": "object"}}}'::jsonb
),
(
    'c1000000-0000-0000-0000-000000000004',
    'b1000000-0000-0000-0000-000000000002',
    'update_crm_lead_qualification',
    'Record BANT Qualification',
    'Updates lead stage, qualification criteria (Budget, Authority, Need, Timeline), and intent notes.',
    'standard_write',
    false,
    'write',
    '{"type": "object", "properties": {"contactId": {"type": "string"}, "score": {"type": "number"}, "notes": {"type": "string"}, "bant": {"type": "object"}}, "required": ["contactId"]}'::jsonb,
    '{"type": "object", "properties": {"success": {"type": "boolean"}}}'::jsonb
) ON CONFLICT (tool_version_id, function_name) DO NOTHING;

-- 3. Twilio SMS Capabilities
INSERT INTO tool_capabilities (
    id, tool_version_id, function_name, display_name, description, risk_level, requires_approval, operation_type, input_schema, output_schema
) VALUES
(
    'c1000000-0000-0000-0000-000000000005',
    'b1000000-0000-0000-0000-000000000003',
    'send_sms_message',
    'Send SMS Notification',
    'Sends an SMS text message with meeting link, summary, or booking confirmation to caller.',
    'standard_write',
    false,
    'write',
    '{"type": "object", "properties": {"to": {"type": "string"}, "message": {"type": "string"}}, "required": ["to", "message"]}'::jsonb,
    '{"type": "object", "properties": {"messageSid": {"type": "string"}, "status": {"type": "string"}}}'::jsonb
),
(
    'c1000000-0000-0000-0000-000000000006',
    'b1000000-0000-0000-0000-000000000003',
    'send_otp_verification',
    'Dispatch OTP Security Code',
    'Dispatches a 6-digit one-time passcode for caller identity verification.',
    'consequential_action',
    false,
    'consequential',
    '{"type": "object", "properties": {"phoneNumber": {"type": "string"}}, "required": ["phoneNumber"]}'::jsonb,
    '{"type": "object", "properties": {"verificationSessionId": {"type": "string"}}}'::jsonb
) ON CONFLICT (tool_version_id, function_name) DO NOTHING;

-- 4. Stripe Capabilities (Consequential Financial Operations)
INSERT INTO tool_capabilities (
    id, tool_version_id, function_name, display_name, description, risk_level, requires_approval, operation_type, input_schema, output_schema
) VALUES
(
    'c1000000-0000-0000-0000-000000000007',
    'b1000000-0000-0000-0000-000000000004',
    'create_payment_link',
    'Generate Secure Checkout Link',
    'Creates a PCI-compliant checkout URL for booking deposits or retainers.',
    'standard_write',
    false,
    'write',
    '{"type": "object", "properties": {"amountCents": {"type": "number"}, "description": {"type": "string"}, "customerEmail": {"type": "string"}}, "required": ["amountCents", "description"]}'::jsonb,
    '{"type": "object", "properties": {"checkoutUrl": {"type": "string"}, "paymentId": {"type": "string"}}}'::jsonb
),
(
    'c1000000-0000-0000-0000-000000000008',
    'b1000000-0000-0000-0000-000000000004',
    'authorize_charge_on_call',
    'Authorize On-Call Charge',
    'Consequential financial action charging customer account directly. REQUIRES HUMAN APPROVAL.',
    'critical_financial',
    true,
    'consequential',
    '{"type": "object", "properties": {"amountCents": {"type": "number"}, "customerId": {"type": "string"}, "chargeReason": {"type": "string"}}, "required": ["amountCents", "customerId"]}'::jsonb,
    '{"type": "object", "properties": {"chargeId": {"type": "string"}, "status": {"type": "string"}}}'::jsonb
) ON CONFLICT (tool_version_id, function_name) DO NOTHING;

-- 5. Supervisor Escalation Capabilities
INSERT INTO tool_capabilities (
    id, tool_version_id, function_name, display_name, description, risk_level, requires_approval, operation_type, input_schema, output_schema
) VALUES
(
    'c1000000-0000-0000-0000-000000000009',
    'b1000000-0000-0000-0000-000000000005',
    'escalate_to_supervisor',
    'Transfer to Live Supervisor',
    'Immediately transfers the active phone session to an on-call human supervisor and logs an escalation incident.',
    'consequential_action',
    false,
    'consequential',
    '{"type": "object", "properties": {"reason": {"type": "string"}, "urgency": {"type": "string", "enum": ["high", "critical"]}, "sentimentScore": {"type": "number"}}, "required": ["reason"]}'::jsonb,
    '{"type": "object", "properties": {"ticketId": {"type": "string"}, "escalated": {"type": "boolean"}}}'::jsonb
) ON CONFLICT (tool_version_id, function_name) DO NOTHING;

-- 6. Postgres MCP Server Capabilities
INSERT INTO tool_capabilities (
    id, tool_version_id, function_name, display_name, description, risk_level, requires_approval, operation_type, input_schema, output_schema
) VALUES
(
    'c1000000-0000-0000-0000-000000000010',
    'b1000000-0000-0000-0000-000000000006',
    'mcp_query_inventory_catalog',
    'MCP Query Inventory Catalog',
    'Executes a read-only parameterized query against enterprise product inventory via sandboxed MCP endpoint.',
    'safe_read',
    false,
    'read',
    '{"type": "object", "properties": {"productCode": {"type": "string"}, "category": {"type": "string"}}, "required": ["productCode"]}'::jsonb,
    '{"type": "object", "properties": {"items": {"type": "array"}}}'::jsonb
) ON CONFLICT (tool_version_id, function_name) DO NOTHING;

-- 7. Web Grounding MCP Capabilities
INSERT INTO tool_capabilities (
    id, tool_version_id, function_name, display_name, description, risk_level, requires_approval, operation_type, input_schema, output_schema
) VALUES
(
    'c1000000-0000-0000-0000-000000000011',
    'b1000000-0000-0000-0000-000000000007',
    'mcp_verify_external_fact',
    'MCP Fact-Check External Claim',
    'Queries verified web grounding MCP provider to confirm current external facts with citations.',
    'safe_read',
    false,
    'read',
    '{"type": "object", "properties": {"query": {"type": "string"}, "expectedEntity": {"type": "string"}}, "required": ["query"]}'::jsonb,
    '{"type": "object", "properties": {"verified": {"type": "boolean"}, "citations": {"type": "array"}}}'::jsonb
) ON CONFLICT (tool_version_id, function_name) DO NOTHING;
