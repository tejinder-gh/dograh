# Migration Matrix: AI Calling Agent OS → Dograh

## Executive Summary
This document establishes the authoritative migration classification for all source files from the original custom implementation (**AI Calling Agent OS**) across two evaluated pull requests:
- **Foundation PR #1**: Branch `feat/multitenant-neon-foundation` at commit `9ca231a350db45c66aeaf1da615bdb101c982fd5`
- **Tool Marketplace PR #2**: Branch `feat/multitenant-tool-marketplace` at commit `61474786a7dfa9ac53006b4ff4ccb0944c247324`
- **Target Platform**: Dograh at verified upstream reference `b677cac4acc6f0dc18010457c98af75e137f8181`

Every source candidate has been inspected independently and classified into one of six contractually defined categories:
1. `PORT`: Retain core business logic and algorithms, migrating into the isolated business extension service with strict type safety and schema scoping.
2. `ADAPT`: Substantially adjust to interface with Dograh's data models, authentication mechanisms, and UI design system.
3. `REFERENCE ONLY`: Useful conceptual reference or pattern; not ported directly as executable code.
4. `ALREADY EXISTS IN DOGRAH`: Capability fully provided by Dograh core infrastructure; custom implementation retired.
5. `DEFER`: Valid business capability planned for future migration stages (Stage 2, 3, or 4).
6. `DISCARD`: Architectural antipattern, duplicate runtime, or custom infrastructure explicitly prohibited by contract.

---

## Source File Classification Matrix

| Source File | Source Commit | Original Responsibility | Dograh Equivalent | Decision | Destination | Migration Rationale & Scope | Risks & Mitigation | Verification Evidence |
|---|---|---|---|---|---|---|---|---|
| `src/db/repositories/domains.repository.ts` | `9ca231a` (PR #1) | Tenant business profile CRUD, operating hours, brand tone, agent linking | `public.organization_configurations` (telephony only) | **ADAPT** | `extensions/business-api/src/repositories/business-profile.repository.ts`, `business-profile.service.ts` | Extract domain profile data: name, domain, industry, description, brand tone, objectives, timezone/hours. Remove custom agent creation; bind to Dograh `workflow_id`. Strip fake defaults. | Org isolation leak. Mitigated by composite unique constraints and strict org authentication middleware. | Unit tests + PostgreSQL integration tests in `business-profile.test.ts`. |
| `src/types.ts` (Domain Types) | `9ca231a` (PR #1) | Monolithic TypeScript types for domains, contacts, transcripts, sessions | Partial (`ui/src/client/types.gen.ts`) | **ADAPT** | `extensions/business-api/src/domain/business-profile.types.ts`, `contact.types.ts`, `interaction.types.ts` | Split monolithic types into modular, cohesive domain type definitions backed by runtime Zod validation schemas. | Type drift. Mitigated by deriving API request/response contracts directly from domain schemas. | Strict TypeScript compiler check (`bun x tsc --noEmit`). |
| `src/components/ClientDomainsHub.tsx` | `9ca231a` (PR #1) | React UI for managing business profiles, objectives, brand tone | None in Dograh UI | **ADAPT** | `ui/src/app/business/profiles/page.tsx`, `ui/src/components/business/profiles/` | Build modern Next.js App Router views using Dograh's Tailwind, Radix/shadcn design system. Connect to authenticated server-side `/api/business/profiles`. | Unauthenticated access. Mitigated by server-side session checks in Next.js route handlers. | Vitest UI component tests + Next.js build verification. |
| `src/db/repositories/contacts.repository.ts` | `9ca231a` (PR #1) | Contacts CRUD, lead lifecycle, tags, lead scoring, BANT, timeline events | None (Dograh has no CRM) | **PORT** | `extensions/business-api/src/repositories/contact.repository.ts`, `crm.service.ts` | Port complete CRM contact management and timeline audit ledger. Use deterministic scoring rules; eliminate arbitrary fake data. | Cross-tenant data access. Mitigated by row-level organization scoping in PostgreSQL `business_ext.contacts`. | Multi-tenant isolation test suite (`crm-isolation.test.ts`). |
| `src/db/repositories/interactions.repository.ts` | `9ca231a` (PR #1) | Stores interaction history, sentiment, channel, duration, transcripts | `public.workflow_runs` (execution state) | **ADAPT** | `extensions/business-api/src/repositories/interaction.repository.ts` | Store CRM-level interaction records referencing Dograh's authoritative `workflow_id`, `definition_id`, and `run_id`. Do not duplicate raw audio or execution traces. | Foreign key mismatch. Mitigated by recording string run IDs and verifying run ownership through Dograh API. | Integration tests in `interaction.test.ts`. |
| `src/components/CrmDirectory.tsx` | `9ca231a` (PR #1) | CRM directory UI, contact search, filtering, notes, interaction timeline | None in Dograh UI | **ADAPT** | `ui/src/app/business/contacts/page.tsx`, `ui/src/components/business/crm/` | Implement modular Next.js directory and detail drawer matching Dograh's sleek dark theme and typography. | UI performance on large lists. Mitigated by server-side pagination and indexed DB queries. | Next.js build + Vitest UI checks. |
| `src/components/LeadUploadManager.tsx` | `9ca231a` (PR #1) | CSV upload and column mapping for bulk lead ingestion | None in Dograh UI | **ADAPT** | `ui/src/components/business/crm/LeadUploadModal.tsx` | Adapt client-side CSV parsing with deterministic column matching. Integrate with `/api/business/contacts/batch`. | Malformed CSV or injection. Mitigated by strict Zod schema validation on every row. | Unit tests for CSV parser and batch ingestion. |
| `src/db/repositories/escalations.repository.ts` | `9ca231a` (PR #1) | Escalation tickets, urgency levels, supervisor notes, personnel directory | Dograh transfer node (`TransferCallConfig`) | **DEFER** | `extensions/business-api/src/domain/escalation.types.ts` (Stage 2) | Preserve business escalation tickets and personnel in Stage 2. Dograh performs the live telephony transfer. | Duplicating call transfer. Mitigated by restricting extension to ticket recording only. | Deferred to Stage 2. |
| `src/services/prompt-engine.ts` | `9ca231a` (PR #1) | Layered prompt composer (safety, industry, tenant, persona) | Dograh prompt nodes, system instructions, global prompts | **REFERENCE ONLY** | `docs/business-extension/PROMPT_POLICY_REFERENCE.md` | Do not port custom resolution engine. Dograh's workflow graph natively models prompt assembly. Industry templates translate into Dograh workflow graphs in Stage 2. | Engine conflict. Mitigated by utilizing Dograh's workflow editor and versioning directly. | Deferred to Stage 2. |
| `src/db/repositories/prompts.repository.ts` | `9ca231a` (PR #1) | Prompt templates and versions CRUD | `public.workflow_definitions` | **ALREADY EXISTS IN DOGRAH** | N/A | Dograh provides comprehensive workflow definitions, immutable version publishing, and node prompts. | Schema duplication. Mitigated by retiring custom prompt tables. | Verified against Dograh's `/workflow/{id}/versions` API. |
| `src/utils/agent-logic.ts` | `9ca231a` (PR #1) | CSV parser, phone formatter, duration formatter, sentiment categorization | Partial in Dograh utils | **ADAPT** | `extensions/business-api/src/domain/formatters.ts` | Extract pure formatting and CSV parsing functions. Discard simulated LLM logic and fake audio generators. | Logic regression. Mitigated by unit test coverage. | Unit tests in `formatters.test.ts`. |
| `migrations/001_initial_schema.sql` | `9ca231a` (PR #1) | Complete schema for custom multi-tenant database | Dograh PostgreSQL schema | **ADAPT** | `extensions/business-api/migrations/001_business_ext_init.sql` | Extract `business_profiles`, `contacts`, `contact_timeline_events`, and `interactions` into an isolated `business_ext` schema. Never alter `public.*`. | Collision with Dograh tables. Mitigated by dedicated schema namespace and isolated migration runner. | Migration applied and verified on live PostgreSQL 17. |
| `src/db/repositories/bookings.repository.ts` | `9ca231a` (PR #1) | Booking records, idempotency keys, appointment conflict prevention | None in Dograh core | **DEFER** | Stage 3 booking service | Defer to Stage 3 per implementation contract. Requires provider OAuth and idempotency ledger. | Double-booking / race conditions. Mitigated by DB unique constraints and durable idempotency. | Deferred to Stage 3. |
| `src/lib/google-calendar.ts` | `9ca231a` (PR #1) | Google Calendar API client | None | **DEFER** | Stage 3 calendar adapter | Defer to Stage 3. Must use tenant-bound OAuth credentials rather than untrusted client tokens. | Token leakage. Mitigated by server-side credential vault. | Deferred to Stage 3. |
| `src/components/BookingModal.tsx`, `BookingsView.tsx` | `9ca231a` (PR #1) | Booking calendar UI and scheduling dialog | None | **DEFER** | Stage 3 UI | Defer to Stage 3. | N/A | Deferred to Stage 3. |
| `src/types/marketplace.types.ts` | `6147478` (PR #2) | Commercial marketplace types, tool catalog, approval requests | Partial (`api/schemas/tool.py`) | **DEFER** | Stage 3 commercial policies | Dograh provides generic HTTP/MCP tools. Preserve commercial policies (entitlements, approvals, billing) in Stage 3. | Dual tool runtime. Mitigated by delegating runtime execution to Dograh HTTP tools. | Deferred to Stage 3. |
| `src/services/entitlement.service.ts` | `6147478` (PR #2) | Tool subscription entitlements and capability gating | None in Dograh core | **DEFER** | Stage 3 entitlement service | Defer to Stage 3. | Unauthorized tool execution. Mitigated by server-side entitlement checks. | Deferred to Stage 3. |
| `src/services/tool-execution-gateway.service.ts` | `6147478` (PR #2) | Gateway proxy with SSRF protection, idempotency, approval checks | `api/services/workflow/tool_execution.py` | **DEFER** | Stage 3 gateway adapter | Dograh executes HTTP tools; our gateway will act as an authorized webhook target enforcing business approvals. | Argument spoofing. Mitigated by cryptographic credential verification. | Verified prototype in `probe_runtime_tool.py`. |
| `src/services/secret-vault.service.ts` | `6147478` (PR #2) | AES-256-GCM encryption for third-party connector credentials | `public.external_credentials` | **DEFER** | Stage 3 | Review Dograh external credentials vs application-level secret vault in Stage 3. | Unencrypted keys at rest. Mitigated by secure secret storage. | Deferred to Stage 3. |
| `src/db/repositories/marketplace-*.repository.ts` | `6147478` (PR #2) | Marketplace catalog and execution log repositories | None | **DEFER** | Stage 3 | Defer to Stage 3. | Schema bloat. | Deferred to Stage 3. |
| `migrations/002_*.sql`, `003_*.sql` | `6147478` (PR #2) | Marketplace schema and catalog seed data | None | **DEFER** | Stage 3 | Defer to Stage 3. | N/A | Deferred to Stage 3. |
| `src/components/marketplace/*` | `6147478` (PR #2) | Marketplace discover, tool drawer, assignments UI | `ui/src/app/tools/` | **DEFER** | Stage 3 | Defer to Stage 3. | UI confusion with native tools. | Deferred to Stage 3. |
| `src/components/AnalyticsDashboard.tsx` | `9ca231a` (PR #1) | Custom call volume, sentiment, conversion metrics UI | Dograh `/usage`, `/recordings`, and Langfuse | **DEFER** | Stage 4 Script Intelligence | Defer to Stage 4. Connects Dograh QA and traces with verified business outcomes. | Inaccurate metric reporting. Mitigated by unknown-state indicators. | Deferred to Stage 4. |
| `src/db/repositories/stats.repository.ts` | `9ca231a` (PR #1) | Aggregate statistics repository | Dograh observability and usage services | **DEFER** | Stage 4 | Defer to Stage 4. | N/A | Deferred to Stage 4. |

---

## Prohibited Infrastructure Files (Section 4 — Strictly Discarded)

The following files represent custom infrastructure that directly duplicates or conflicts with Dograh's core platform architecture. They are **strictly discarded** from transplantation:

| Prohibited File | Source Commit | Reason for Discard | Dograh Core Replacement |
|---|---|---|---|
| `server.ts` | `9ca231a` / `6147478` | Custom Express monolithic server and route mounting | Dograh FastAPI backend (`api/app.py`) + Next.js App Router API handlers + isolated Business Extension service |
| `src/App.tsx` | `9ca231a` / `6147478` | Custom React client SPA routing, auth context, layout shell | Dograh Next.js App Router (`ui/src/app/layout.tsx`, `AppLayout.tsx`, `AppSidebar.tsx`) |
| `src/db/connection.ts` | `9ca231a` | Custom `pg` connection pool with Neon session-level RLS injection (`withTenantContext`) | Scoped PostgreSQL connection pool targeting `business_ext` schema; Dograh API uses asyncpg |
| `src/db/database.ts` | `9ca231a` | Neon serverless driver initialization | Standard connection pool configured via environment variables |
| `src/db/migrator.ts` | `9ca231a` | Custom SQL file runner for root database | Dedicated `business_ext` migration script |
| `src/db/repositories/tenants.repository.ts` | `9ca231a` | Custom tenant table and provisioning logic | Dograh `public.organizations` + durable mapping table `business_ext.organization_mappings` |
| `src/middleware/tenant-auth.ts` | `9ca231a` | Custom Express JWT / header middleware | Dograh session auth via Next.js server handlers (`getServerUser`) and extension auth middleware |
| `src/services/identity-verifier.ts` | `9ca231a` | Firebase Admin SDK cryptographic verification | Dograh's established auth mechanism (Stack Auth for Cloud, JWT/password for OSS) |
| `src/utils/auth-client.ts` | `9ca231a` / `6147478` | Client-side Firebase token getter and header builder | Dograh UI auth context (`useAuth`, `getAccessToken`) |
| `src/voice/orchestrator.ts` | `9ca231a` | Custom browser WebRTC / WebSocket audio loop and cascade pipeline | Dograh's mature Pipecat runtime, smallwebrtc signaling, and native realtime adapters |
| `src/voice/tool-gate.ts` | `9ca231a` | In-flight tool invocation gate for custom voice loop | Dograh's native workflow tool execution engine (`api/services/workflow/tool_execution.py`) |
| `src/voice/types.ts` | `9ca231a` | Voice runtime message frames and session types | Pipecat and Dograh protocol types |
| `src/services/connectors/telephony-connector.ts` | `6147478` | Custom Twilio/Telnyx bridge | Dograh telephony provider integrations (SIP trunks, FreeSWITCH/Asterisk ARI, carrier webhooks) |
| `src/services/connectors/mcp-connector.ts` | `6147478` | Custom MCP client transport | Dograh native MCP server integration (`api/services/workflow/tools/mcp_tool.py`) |
| `src/services/connectors/payment-connector.ts` | `6147478` | Mock payment gateway | Deferred; external payment integrations belong in Stage 3 tool gateway |
| `src/utils/ssrf-guard.ts` | `6147478` | Socket-level DNS pinning and private IP blocklist | Retained as architectural reference for Stage 3 HTTP tool gateway |

---

## Conclusion & Gate Status
- **Stage 0 Complete**: All source candidates reviewed, classified, and mapped.
- **Stage 1 Authorized Scope**: Business Profiles CRUD, CRM Contacts & Interaction timeline, Organization mapping, provisional branding, and two-organization integration tests.
- **Out of Scope for Stage 1**: Bookings, Marketplace execution, Live telephony, Paid AI inference.
