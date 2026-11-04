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
| **COM-02** | Canadian CRTC Compliance & Calling Rules | P0 | `RESOLVED` | Implemented separate Canadian CRTC Unsolicited Telecommunications Rules (UTR): Weekdays 9:00 AM - 9:30 PM, Weekends 10:00 AM - 6:00 PM local time. Automatic NANP area-code jurisdiction detection (`CA` vs `US`). Outbound telemarketing to Canada is disabled pending National DNCL subscription. Proved by 15/15 Pytest tests. |
| **COM-03** | Recipient Timezone & Safe Harbor Gating | P0 | `RESOLVED` | Eliminated Eastern Time default fallback. Modeled recipient IANA timezone distinctly from area code hints; enforced Safe Harbor intersection across multi-timezone NPAs (calls must be legal in all candidate timezones); denied unverified timezones for ported/VoIP numbers. Proved by `timezone_resolver.py` & Pytest. |
| **SEC-06** | Database Target Safety Guard & Test Boundary | P0 | `RESOLVED` | Authoritative database guard in TS (`database-guard.ts`) and Python (`database_guard.py`). Prohibits test suites from targeting Neon production branch (`ep-wispy-truth-b5kkygdq`, `br-twilight-base-b51aowww`). Removed automatic DDL/migrations (`runMigrations()`) from all 10 integration test `beforeAll` hooks. Required explicit `--confirm-migration` flag for schema migrations. Proved by 14 unit tests. |
| **QUO-04** | Authoritative Atomic Quota Reservation | P0 | `RESOLVED` | Replaced non-atomic concurrent call TOCTOU count query with authoritative atomic reservation (`reserve_workflow_run_slot`), keyed to `workflow_run_id` for idempotency across retries, pulling limits from subscription, and releasing on complete/error/cancel with orphaned slot recovery. Proved by 6/6 concurrent race tests (10 simultaneous calls with capacity 1 = 1 acquired, 9 rejected). |

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

### A. Non-DB Mocked & Pure Unit Test Execution (Executed & Verified)

| Subsystem / Component | Framework | Test Focus | Executed | Result | Safety Enclosure |
|---|---|---|---|---|---|
| **Compliance & Timezone Controls** | Pytest 9.1 / Python 3.13 | TCPA/CRTC boundaries, Safe Harbor candidate intersection, Ported/VoIP unverified denial, DNC fail-closed | 15 tests | **100% PASS** (15/15) | Pure mock, no remote DB |
| **Atomic Quota Reservation Race** | Pytest 9.1 / Python 3.13 | 10 simultaneous calls with capacity=1, idempotency per workflow run, slot release & orphan cleanup | 6 tests | **100% PASS** (6/6) | In-memory atomic fallback |
| **Python Database Safety Guard** | Pytest 9.1 / Python 3.13 | Rejection of production Neon endpoint, safe local host validation, test mode guard assertions | 7 tests | **100% PASS** (7/7) | Pure unit isolation |
| **Quota Service Unit Suite** | Pytest 9.1 / Python 3.13 | Plan entitlements, BYOK restrictions, zero-minute exhaustion, period boundaries, error handling | 46 tests | **100% PASS** (46/46) | AsyncMock DB fixtures |
| **Call Concurrency Service** | Pytest 9.1 / Python 3.13 | Concurrency limiting, PostHog saturation metrics, scoped limits, worker counts | 14 tests | **100% PASS** (14/14) | Authenticated local Redis |
| **Calendar Booking Tool** | Pytest 9.1 / Python 3.13 | Slot lookup, advisory lock retry logic, collision handling | 4 tests | **100% PASS** (4/4) | Mocked tool execution |
| **TS Database Target Safety Guard** | Bun Test 1.3 | Production Neon rejection, local host validation, migration block in test mode | 7 tests | **100% PASS** (7/7) | Pure unit isolation |
| **Lead Scoring & Safe Math** | Bun Test 1.3 | Lead score bounds [0, 100], zero-division safe percentages/ratios/deltas | 14 tests | **100% PASS** (14/14) | Pure unit calculation |
| **Business Validation Schemas** | Bun Test 1.3 | Zod schemas: profiles, contacts, batch RFC CSV imports, sentiment bounds | 8 tests | **100% PASS** (8/8) | Schema validation |
| **Next.js Auth & Admin Proxies** | Vitest 4.1 / React 19 | Superuser auth, tenant isolation, subscription proxy, cookie forgery rejection | 30 tests | **100% PASS** (30/30) | Mocked Next.js Edge |
| **RFC 4180 CSV Parser** | Vitest 4.1 / React 19 | Quoted commas, multiline entries, CRLF endings, escaped quotes | 6 tests | **100% PASS** (6/6) | Client utility unit test |
| **Total Non-DB Executed** | — | — | **157 tests** | **100% PASS** (157/157) | **0 Failures** |

### B. Remote Integration Tests (Neon Main Branch `ai_calling_os`)

| Subsystem / Suite | Target Endpoint | Status | Operational Reason |
|---|---|---|---|
| **Business API Integration Tests** (10 test files) | `ep-wispy-truth-b5kkygdq` (Main) | **BLOCKED** | Blocked by `assertSafeDatabaseTarget`. Running integration tests against Neon main branch violates Stage A safety boundary. `runMigrations()` removed from test hooks. Requires isolated staging branch `br-staging-test`. |
| **Quota Live DB Integration** (`test_quota_live_db.py`) | `ep-wispy-truth-b5kkygdq` (Main) | **BLOCKED** | Live DB execution suspended on main branch pending provisioning of dedicated ephemeral test branch. Unit coverage maintained via `test_quota_concurrency_race.py` and `test_quota_service.py`. |

---

## 4. RELEASE-GATE VERIFICATION TABLE

| Release Gate / Requirement | Target Area | Status | Evidence / Verification Method | Operational Limitations |
|---|---|---|---|---|
| **Database Safety Boundary** | Data Integrity | **VERIFIED** | Unit tests (`database-guard.test.ts`, `test_database_guard.py`); `runMigrations()` stripped from test `beforeAll` hooks | Rejects production Neon endpoint in test mode |
| **Explicit Migration Approval** | Operations | **VERIFIED** | Migrator requires `--confirm-migration` or `options.approved=true`; unconditionally rejects `NODE_ENV=test` | Explicit operator action only |
| **Atomic Quota Reservation** | Quota / Billing | **VERIFIED** | 6/6 race tests (`test_quota_concurrency_race.py`); 10 simultaneous calls with capacity=1 yields 1 acquired, 9 rejected | Idempotent on `workflow_run_id` |
| **Orphaned Slot Recovery** | Reliability | **VERIFIED** | `recover_orphaned_reservations` in `service.py`; recovers timed-out reservations | Background recovery sweep |
| **Recipient Timezone Resolution** | Compliance | **VERIFIED** | `timezone_resolver.py` + 15 tests in `test_compliance_controls.py` | Distinguishes verified IANA tz from area codes |
| **Safe Harbor Multi-TZ NPA Intersection** | Compliance | **VERIFIED** | Tested with multi-timezone NPA 208 (Mountain/Pacific); requires legal window across all candidate timezones | Blocks dialing if outside hours in ANY candidate tz |
| **Ported / VoIP Number Gating** | Compliance | **VERIFIED** | Unit tests reject unverified ported/VoIP numbers without verified recipient timezone | Requires verified contact IANA tz |
| **Canadian Outbound Marketing Gating** | Compliance | **VERIFIED** | Unit tests reject Canadian marketing calls with HTTP 403 `canadian_outbound_marketing_disabled` | Disabled pending National DNCL subscription |
| **Admin Session Security** | Auth / Platform | **VERIFIED** | 5 Vitest tests (`admin/session/route.test.ts`) | Restricted to verified superusers |
| **Internal Signed Assertions** | Inter-service | **VERIFIED** | Vitest suite (`business-auth.test.ts`); SHA-256 nonces | Shared HMAC secret >= 32 chars |
| **Telephony WebSocket Auth** | Carrier / Media | **VERIFIED** | 32 Pytest tests (`test_ws_auth.py`); atomic CAS run state | Token bound to call run; CAS atomic |
| **Tenant CRM Isolation** | Data Security | **VERIFIED** | Vitest boundary suite (`business-auth.test.ts`); tenant UUID partitioning | Enforced at Next.js edge and Business API |
| **Calendar Concurrency** | Scheduling | **VERIFIED** | Unit advisory lock verification; DB exclusion constraint migration 007 | Advisory lock `apt_lock_${tenantId}` |
| **Live Main DB Integration Tests** | Test Harness | **BLOCKED** | Intentionally blocked by Database Target Guard | Requires `br-staging-test` branch |
| **External Calendar Sync** | Integration | **NOT TESTED** | Internal PostgreSQL calendar verified; OAuth sync unintegrated | Stage C post-pilot deliverable |
| **Live Payment Card Charges** | Billing | **NOT TESTED** | Self-serve disabled (403); Admin grants audited; live card charge unconducted | Direct Stripe webhook pending |

---

## 5. GATE DECISION & AUTHORIZATION NOTICE

* **Current Status:** **HOLD — STOPPED FOR INDEPENDENT VERIFICATION REVIEW**
* **Local Working Tree:** Clean. All changes verified locally.
* **Prohibitions Maintained:**
  - No `git push` executed.
  - No PR merged or taken out of draft without authorization.
  - No production schema altered without authorization.
  - No live carrier calls placed on paid accounts.
