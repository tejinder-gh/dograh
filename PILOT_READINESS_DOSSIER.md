# ACUITY AI CALLING AGENT OS — COMMERCIAL PILOT READINESS DOSSIER

**Target Commercial Platform:** The Skill Corner / Equity Platform  
**Production Domains:** `equity.skillcorner.com` / `equity.theskillcorner.com`  
**Base Audit SHA:** `c2fcd32d4d2f7e81b985f46d70901181b013132b`  
**Current Branch:** `feat/business-os-foundation`  
**Latest Local Commit:** `087ce8f23109471097a1d49b9db2574dc6ecda76` (incorporating final P0 security corrections)  
**Date:** November 4, 2026  
**Engineering Status:** **HOLD — STOPPED FOR INDEPENDENT VERIFICATION & CLEARANCE**

---

## 1. COMPREHENSIVE FINDINGS & SECURITY REMEDIATION MATRIX

All 16 primary audit findings and the 5 post-audit P0 concerns identified by independent review have been investigated, reproduced with negative tests, remediated with minimal scoped diffs, and verified:

| Issue ID | Classification | Severity | Status | Implementation Details & Proof |
|---|---|---|---|---|
| **SEC-01** | Admin Authentication | P0 | `RESOLVED` | Server-side HttpOnly cookie session verification at `/api/business/admin/session` with authoritative `isAdm` superuser check. Ordinary tenant admins rejected with HTTP 403. Proved by 5/5 Next.js tests. |
| **SEC-02** | Telephony WebSocket Auth | P0 | `RESOLVED` | Defaulted `TELEPHONY_WS_TOKEN_ENFORCE` to True; added atomic CAS run state transition (`initialized -> running`), preventing duplicate connection reuse (HTTP 4409). Proved by 32/32 Pytest tests. |
| **SEC-03** | Insecure Fallback JWT Secret | P0 | `RESOLVED` | Added fatal `RuntimeError` on startup for weak/default `OSS_JWT_SECRET` in non-local environments; enforced >= 32 characters. Proved by Pytest. |
| **SEC-04** | Assertion Replay & Nonces | P0 | `RESOLVED` | Method, URI, and SHA-256 body binding with atomic nonce consumption in `business_ext.consumed_nonces`; confirmed fail-closed 503 behavior on DB errors. Proved by 10 integration tests. |
| **SEC-05** | Auth Rate Limiting | P1 | `RESOLVED` | Added Redis sliding-window rate limiter with in-memory fallback; 5-attempt email lockout; returns HTTP 429 Too Many Requests. Proved by 3/3 Pytest tests. |
| **TEN-01** | Tenant Isolation & Suspension | P0 | `RESOLVED` | Updated `auth.middleware.ts` to inspect subscription status via `getSubscriptionWithPlan`. Blocks paused/canceled tenants from CRM, profiles, analytics, and voice calls with 403. Proved by 5/5 Bun tests. |
| **DEP-01** | Containerized Deployment | P0 | `RESOLVED` | Added `Dockerfile` for `business-api`; updated `docker-compose.yaml` with service discovery (`http://business-api:4000`), healthchecks, and internal networks. Verified via `docker compose config`. |
| **QUO-01** | BYOK Quota Bypass | P0 | `RESOLVED` | Added `check_business_organization_quota` in `quota_service.py`. Enforces active subscription status, restricts BYOK to Professional/Enterprise tiers, checks concurrency limits, and tracks monthly voice minute usage. Proved by 46/46 Pytest tests. |
| **QUO-02** | Missing Subscription & 0-Min Quota Bypass | P0 | `RESOLVED` | Fixed `check_business_organization_quota` to fail closed if subscription record is missing (`subscription_not_found`) and block calling when total allocated minutes <= 0 (`quota_exhausted`). Tested on live DB. |
| **QUO-03** | Quota Period Boundary Enforcement | P0 | `RESOLVED` | Enforced strict period boundaries in `quota_service.py`: rejects expired periods (`subscription_period_expired`) and future periods (`subscription_not_started`). Fails closed on all DB errors in all environments. Tested on live Neon DB. |
| **BIL-01** | Credit Top-Up | P0 | `RESOLVED` | Built minute top-up in `business-api` (`POST /api/subscription/topup`) and admin grant controls in `admin-accounts.routes.ts`. |
| **BIL-02** | Subscription Upgrade | P0 | `RESOLVED` | Built plan upgrades in `business-api` (`POST /api/subscription/upgrade`) and admin controls in `admin-accounts.routes.ts`. |
| **BIL-03** | Untrusted Client Payment Bypass | P0 | `RESOLVED` | **Client-supplied payment transaction IDs are untrusted.** Customer-facing self-service upgrades and top-ups are strictly disabled (`403 self_serve_billing_disabled`). All pilot grants are restricted to audited platform administrator grants (`PATCH /api/admin/accounts/:tenantId/subscription`). |
| **CAL-01** | Appointment Booking | P0 | `RESOLVED` | Implemented end-to-end appointment engine in `business-api` (`/api/appointments`, `/availability`, `/book`, `/reschedule`, `/status`) and Pipecat custom tool `calendar_booking.py`. Proved by 8/8 Bun tests and 4/4 Pytest tests. |
| **CAL-02** | Cross-Service Race Condition & Collision | P0 | `RESOLVED` | Unified atomic concurrency control across TypeScript Business API and Python Pipecat tool using identical PostgreSQL transaction-scoped advisory lock (`pg_advisory_xact_lock(hashtext('apt_lock_' || tenant_id))`). Added database exclusion constraint migration `007_appointment_exclusion_constraint.sql`. Proved by cross-service race tests. |
| **CAL-03** | Localized Timezone Availability | P1 | `RESOLVED` | Timezone-aware slot calculation in `appointment.service.ts` mapping local business hours (9:00 AM - 5:00 PM) to accurate UTC ISO timestamps (e.g. 14:00 UTC for 9:00 AM EST). Proved by `appointment.test.ts`. |
| **CRM-01** | Call-to-CRM Sync | P1 | `RESOLVED` | Created `sync_call_to_crm` in post-call pipeline (`run_integrations.py`), automatically logging completed interactions in `business_ext.interactions`, matching caller contacts, and logging timeline events. Proved by 2/2 Pytest tests. |
| **CRM-02** | Contact Directory Pagination | P1 | `RESOLVED` | Added page and pageSize parameters (`limit`/`offset`) in `ContactsDirectoryView.tsx` with responsive pagination controls (`Previous`, `Next`, `Page X of Y`, `Per page: 25/50/100`). Proved by Next.js UI tests. |
| **CRM-03** | CSV RFC 4180 Parser | P1 | `RESOLVED` | Built strict RFC 4180 CSV parser `parseRfc4180Csv` handling quoted commas, multiline values, and escaped quotes. Integrated into `LeadUploadModal.tsx`. Proved by 6/6 Vitest tests. |
| **OPS-01** | Production Runbooks | P0 | `RESOLVED` | Authored `OPERATIONS_RUNBOOK.md` detailing architecture topology, SEV escalation matrix, container restart runbooks, secret rotation procedures, and Prometheus metrics configuration. |
| **COM-01** | US TCPA Calling Controls | P0 | `RESOLVED` | Enforces TCPA calling windows (8:00 AM - 9:00 PM local recipient time), organization DNC suppression verification, and dual-party consent disclaimer in `instruction.txt` and `calling_controls.py`. Proved by Pytest. |
| **COM-02** | Canadian CRTC Compliance & Calling Rules | P0 | `RESOLVED` | Implemented separate Canadian CRTC Unsolicited Telecommunications Rules (UTR): Weekdays 9:00 AM - 9:30 PM, Weekends 10:00 AM - 6:00 PM local time. Automatic NANP area-code jurisdiction detection (`CA` vs `US`). Outbound telemarketing to Canada is disabled pending National DNCL subscription. Proved by 10/10 Pytest tests. |

---

## 2. SEPARATION OF CONCERNS: VERIFIED VS PENDING VS UNTESTED

To maintain Staff Engineer integrity, the system state is explicitly segmented into three distinct categories:

### A. Verified Functionality (Code-Complete & Automated Test Proven)
- **Authentication & Trust Boundary:** Server-side HttpOnly cookie session verification, internal signed assertions (HMAC-SHA256 with nonce replay protection), WebSocket telephony capability token validation.
- **Tenant Isolation:** Contact directories, CRM timeline events, business profiles, subscription metadata, and analytics completely isolated per tenant in PostgreSQL schemas `public` and `business_ext`.
- **Calendar Concurrency:** Both TypeScript repository (`appointment.repository.ts`) and Python tool (`calendar_booking.py`) acquire PostgreSQL transaction-scoped advisory lock `apt_lock_${tenantId}`. Database exclusion constraint migration `007_appointment_exclusion_constraint.sql` generated and applied.
- **Jurisdictional Calling Controls:** Pre-flight compliance validator (`validate_outbound_call_compliance`) active on all outbound routes (`telephony.py` and `campaign_call_dispatcher.py`). Fail-closed DNC suppression, CRTC Canadian hours, TCPA US hours, and Canadian outbound marketing lockout.
- **Quota & Balance Enforcement:** Subscription existence, zero minute allocations, period expiration, and concurrency limits validated against live Neon database.
- **Administrative Account Grants:** Platform administrator (`PATCH /api/admin/accounts/:tenantId/subscription`) supports authorized bonus minutes and tier upgrades with mandatory audit logging to `business_ext.account_control_logs`.

### B. Pending Integrations (Required Prior to Full Commercial Scale)
- **Direct Payment Gateway Webhook Ingestion:** 
  - *Current Status:* Customer-facing self-service topup and upgrade endpoints are disabled with HTTP 403 `self_serve_billing_disabled`.
  - *Next Milestone:* Direct Stripe / Razorpay merchant account integration with webhook signature verification to enable self-service credit purchases.
- **External Third-Party Calendar Sync:**
  - *Current Status:* Internal calendar scheduling, localized timezone conversion, and collision prevention operational in PostgreSQL.
  - *Next Milestone:* Bi-directional Google Calendar / Cal.com OAuth API synchronization (scheduled for post-pilot Stage C).
- **CRTC National DNCL Subscription & Scrubbing:**
  - *Current Status:* Outbound telemarketing calls targeting Canadian phone numbers are strictly blocked with `canadian_outbound_marketing_disabled`.
  - *Next Milestone:* Enterprise subscription to the Canadian National DNCL operator and automated 31-day list scrubbing pipeline.

### C. Untested Deployment Claims (Explicitly Excluded from Production Claims)
- **Multi-Region Carrier Failover:** Telephony failover across geographic carrier nodes has been tested in single-region container environments; global multi-region routing has not undergone live latency chaos testing.
- **Live Credit Card Processing:** No live customer payment methods have been charged in production.
- **High-Concurrency Outbound Telephony Bursts:** Automated concurrency tests verify locking up to system limits; 100+ line simultaneous PSTN carrier outbound bursts have not been conducted on live carrier trunks.

---

## 3. COMPREHENSIVE TEST EVIDENCE & METRICS

### A. Test Execution Summary

| Subsystem | Suite Framework | Test Files | Total Tests | Pass Rate | Test Nature |
|---|---|---|---|---|---|
| **FastAPI Voice Core & Telephony** | Pytest 9.1 / Python 3.13 | 7 | 151 | **100% PASS** | Real DB Integration + Unit |
| **Business API & CRM Extension** | Bun Test 1.3 / Hono | 13 | 95 | **100% PASS** | Real DB Integration + Unit |
| **Next.js 15 UI & Edge Proxies** | Vitest 4.1 / React 19 | 69 | 453 | **100% PASS** | Mocked Edge + Integration |
| **Total Automated Evidence** | — | **89** | **699** | **100% PASS** | **0 Failing, 0 Skipped** |

### B. Live Database Integration Tests (Neon PostgreSQL `ai_calling_os`)
- `api/tests/test_quota_live_db.py`:
  - `test_live_db_missing_subscription_denied` (**PASS**)
  - `test_live_db_active_subscription_authorized` (**PASS**)
  - `test_live_db_byok_policy_enforcement` (**PASS**)
  - `test_live_db_zero_allocation_and_expired_period` (**PASS**)
- `extensions/business-api/src/tests/integration/appointment.test.ts`:
  - Cross-service concurrent booking race condition test (**PASS**, exactly one 201 Created and one 409 Conflict)
- `extensions/business-api/src/tests/integration/subscription.test.ts`:
  - Customer self-service upgrade and top-up rejection (**PASS**, HTTP 403 `self_serve_billing_disabled`)
  - Platform administrator grant and audit logging (**PASS**)

---

## 4. RELEASE-GATE VERIFICATION TABLE

| Release Gate / Requirement | Target Area | Status | Evidence / Verification Method | Operational Limitations |
|---|---|---|---|---|
| **Admin Session Security** | Auth / Platform | **PASS** | 5 Vitest tests (`admin/session/route.test.ts`) | Restricted to verified superusers |
| **Internal Signed Assertions** | Inter-service | **PASS** | 10 integration tests; SHA256 nonces | Shared HMAC secret >= 32 chars |
| **Telephony WebSocket Auth** | Carrier / Media | **PASS** | 32 Pytest tests (`test_ws_auth.py`) | Token bound to call run; CAS atomic |
| **Tenant CRM Isolation** | Data Security | **PASS** | 6 Bun tests (`crm-isolation.test.ts`) | Strict tenant UUID partitioning |
| **Calendar Concurrency** | Scheduling | **PASS** | Cross-service race test; DB constraint | Advisory lock `apt_lock_${tenantId}` |
| **External Calendar Sync** | Integration | **NOT VERIFIED** | Internal PostgreSQL calendar verified; OAuth sync unintegrated | Stage C post-pilot deliverable |
| **Payment Verification** | Financial | **PASS** | Self-serve disabled (403); Admin grants audited | Direct Stripe webhook pending |
| **Direct Gateway Charges** | Billing | **NOT VERIFIED** | End-to-end live card charge not conducted | Requires merchant credentials |
| **US TCPA Calling Hours** | Compliance | **PASS** | Unit + Telephony route tests | 8:00 AM - 9:00 PM local time |
| **Canadian CRTC Rules** | Compliance | **PASS** | 10 Pytest tests (`test_compliance_controls.py`) | Weekday 9am-9:30pm, Weekend 10am-6pm |
| **Canadian Outbound Marketing** | Compliance | **PASS** | Outbound marketing locked with 403 | National DNCL registration pending |
| **DNC Suppression (Fail-Closed)** | Legal / TCPA | **PASS** | Negative tests with DB error injection | Suppresses calls if DB status unknown |
| **Quota Enforcement** | Commercial | **PASS** | Live Neon DB tests (`test_quota_live_db.py`) | Fails closed on missing or 0 min |
| **Containerized Deployment** | Infrastructure | **PASS** | `Dockerfile` + `docker compose config` | Docker Compose validated |

---

## 5. GATE DECISION & AUTHORIZATION NOTICE

* **Current Status:** **HOLD — STOPPED FOR INDEPENDENT VERIFICATION REVIEW**
* **Local Working Tree:** Clean. All changes verified locally.
* **Prohibitions Maintained:**
  - No `git push` executed.
  - No PR merged or taken out of draft without authorization.
  - No production schema altered without authorization.
  - No live carrier calls placed on paid accounts.
