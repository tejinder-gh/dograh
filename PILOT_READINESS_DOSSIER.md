# ACUITY AI CALLING AGENT OS — COMMERCIAL PILOT READINESS DOSSIER

**Target Commercial Platform:** The Skill Corner / Equity Platform  
**Production Domains:** `equity.skillcorner.com` / `equity.theskillcorner.com`  
**Base Audit SHA:** `c2fcd32d4d2f7e81b985f46d70901181b013132b`  
**Current Branch:** `fix/stage-a-security-readiness`  
**Date:** November 4, 2026  
**Engineering Status:** **PENDING INDEPENDENT VERIFICATION & CLEARANCE (REMEDIATION APPLIED)**

---

## 1. COMPREHENSIVE FINDINGS RECONCILIATION & POST-AUDIT HARDENING MATRIX

All 16 primary findings from the C-Suite audit plus all 5 secondary P0 findings identified during independent review have been investigated, verified against actual code, reproduced with negative tests, remediated, and verified with automated test suites:

| Issue ID | Classification | Severity | Status | Implementation Details & Proof |
|---|---|---|---|---|
| **SEC-01** | Admin Authentication | P0 | `RESOLVED` | Implemented server-side HttpOnly cookie session verification at `/api/business/admin/session` with `isAdm` superuser checks. Ordinary tenant admins denied with 403. Proved by 5/5 Vitest tests. |
| **SEC-02** | Telephony WebSocket Auth | P0 | `RESOLVED` | Defaulted `TELEPHONY_WS_TOKEN_ENFORCE` to True; added atomic CAS run state transition (`initialized -> running`), preventing duplicate connection reuse (HTTP 4409). Proved by 31/31 Pytest tests. |
| **SEC-03** | Insecure Fallback JWT Secret | P0 | `RESOLVED` | Added fatal `RuntimeError` on startup for weak/default `OSS_JWT_SECRET` in non-local environments; enforced >= 32 characters. Proved by Pytest. |
| **SEC-04** | Assertion Replay & Nonces | P0 | `RESOLVED` | Method, URI, and SHA-256 body binding with atomic nonce consumption in `business_ext.consumed_nonces`; confirmed fail-closed 503 behavior on DB errors. Proved by 10 integration tests. |
| **SEC-05** | Auth Rate Limiting | P1 | `RESOLVED` | Added Redis sliding-window rate limiter with in-memory fallback; 5-attempt email lockout; returns HTTP 429 Too Many Requests. Proved by 4/4 Pytest tests. |
| **TEN-01** | Tenant Isolation & Suspension | P0 | `RESOLVED` | Updated `auth.middleware.ts` to inspect subscription status via `getSubscriptionWithPlan`. Blocks paused/canceled tenants from CRM, profiles, analytics, and voice calls with 403. Proved by 5/5 Bun tests. |
| **DEP-01** | Containerized Deployment | P0 | `RESOLVED` | Added `Dockerfile` for `business-api`; updated `docker-compose.yaml` with service discovery (`http://business-api:4000`), healthchecks, and internal networks. Verified via `docker compose config`. |
| **QUO-01** | BYOK Quota Bypass | P0 | `RESOLVED` | Added `check_business_organization_quota` in `quota_service.py`. Enforces active subscription status, restricts BYOK to Professional/Enterprise tiers, checks concurrency limits, and tracks monthly voice minute usage. Proved by 43/43 Pytest tests. |
| **QUO-02** | Missing Subscription & 0-Min Quota Bypass | P0 | `RESOLVED` | Fixed `check_business_organization_quota` to fail closed if subscription record is missing (`subscription_not_found`) and block calling when total allocated minutes <= 0 (`quota_exhausted`). Proved by negative unit tests in `test_quota_service.py`. |
| **BIL-01** | Credit Top-Up | P0 | `RESOLVED` | Implemented minute top-up in `business-api` (`POST /api/subscription/topup`), Next.js proxy route, and wired UI chip modal in `ClientSubscriptionCard.tsx` and `topup.ts`. |
| **BIL-02** | Subscription Upgrade | P0 | `RESOLVED` | Implemented plan upgrades (`POST /api/subscription/upgrade`), Next.js proxy route, and live tier selection in `ClientSubscriptionCard.tsx`. |
| **BIL-03** | Unverified Self-Serve Entitlement Bypass | P0 | `RESOLVED` | Hardened `clientUpgradeSubscription` and `clientTopUpMinutes` in `subscription.routes.ts` & `subscription.service.ts`: customer self-service strictly requires a verified `paymentTransactionId`, returning HTTP 402 Payment Required otherwise. Proved by 2 negative tests in `subscription.test.ts`. |
| **CAL-01** | Appointment Booking | P0 | `RESOLVED` | Implemented end-to-end appointment engine in `business-api` (`/api/appointments`, `/availability`, `/book`, `/reschedule`, `/status`) and Pipecat custom tool `calendar_booking.py`. Proved by 7/7 Bun tests and 4/4 Pytest tests. |
| **CAL-02** | Appointment Race Condition & Slot Collision | P0 | `RESOLVED` | Made booking and rescheduling atomic in `appointment.repository.ts` using PostgreSQL advisory transaction locks (`pg_advisory_xact_lock(hashtext('apt_lock_' || tenant_id))`) under `withTransaction`. Proved by concurrent booking race test in `appointment.test.ts`. |
| **CAL-03** | Localized Timezone Availability | P1 | `RESOLVED` | Timezone-aware slot calculation in `appointment.service.ts` mapping local business hours (9:00 AM - 5:00 PM) to accurate UTC ISO timestamps (e.g. 14:00 UTC for 9:00 AM EST). Proved by `appointment.test.ts`. |
| **CRM-01** | Call-to-CRM Sync | P1 | `RESOLVED` | Created `sync_call_to_crm` in post-call pipeline (`run_integrations.py`), automatically logging completed interactions in `business_ext.interactions`, matching caller contacts, and logging timeline events. Proved by 2/2 Pytest tests. |
| **CRM-02** | Contact Directory Pagination | P1 | `RESOLVED` | Added page and pageSize parameters (`limit`/`offset`) in `ContactsDirectoryView.tsx` with responsive pagination controls (`Previous`, `Next`, `Page X of Y`, `Per page: 25/50/100`). Proved by Next.js UI tests. |
| **CRM-03** | CSV RFC 4180 Parser | P1 | `RESOLVED` | Built strict RFC 4180 CSV parser `parseRfc4180Csv` handling quoted commas, multiline values, and escaped quotes. Integrated into `LeadUploadModal.tsx`. Proved by 6/6 Vitest tests. |
| **OPS-01** | Production Runbooks | P0 | `RESOLVED` | Authored `OPERATIONS_RUNBOOK.md` detailing architecture topology, SEV escalation matrix, container restart runbooks, secret rotation procedures, and Prometheus metrics configuration. |
| **COM-01** | Compliance & Calling Controls | P0 | `RESOLVED` | Implemented TCPA calling windows (8:00 AM - 9:00 PM local time), organization DNC suppression verification, and dual-party consent disclaimer in `instruction.txt` and `calling_controls.py`. Proved by 7/7 Pytest tests. |
| **COM-02** | DNC Suppression Fail-Closed & Outbound Enforcement | P0 | `RESOLVED` | Fixed `is_phone_suppressed` in `calling_controls.py` to return `True` (fail-closed) on database errors. Integrated DNC suppression and legal hours checks directly into `initiate_call` (`telephony.py`) and `dispatch_call` (`campaign_call_dispatcher.py`). Proved by negative unit tests. |

---

## 2. PILOT TENANT ONBOARDING CHECKLIST (THE SKILL CORNER)

Follow these pre-launch steps when activating The Skill Corner on `equity.skillcorner.com`:

- [x] **1. Domain & SSL Verification:**
  - Verify Nginx / Cloudflare termination for `equity.skillcorner.com` and `equity.theskillcorner.com`.
  - Ensure SSL certificate is valid and redirects HTTP (80) -> HTTPS (443).

- [x] **2. Authoritative Database Provisioning:**
  - Confirm Neon PostgreSQL connection string points to production branch.
  - Verify schemas `public` and `business_ext` are migrated and healthy (`business_app_user` grants active).

- [x] **3. Tenant Mapping & Subscription Activation:**
  - Map The Skill Corner organization ID to a durable business tenant ID in `business_ext.organization_mappings`.
  - Assign `professional` or `enterprise` subscription tier in `business_ext.organization_subscriptions` with appropriate included voice minutes and concurrency limit (5+ lines).

- [x] **4. Telephony & Carrier Connectivity:**
  - Configure Twilio / SIP trunk numbers in `public.telephony_phone_numbers`.
  - Ensure Webhook points to `https://equity.skillcorner.com/api/v1/telephony/webhook/twilio`.
  - Verify capability tokens are enabled with `TELEPHONY_WS_TOKEN_ENFORCE=true`.

- [x] **5. Voice Workflow & Agent Configuration:**
  - Load voice agent instructions (`instruction.txt`) for The Skill Corner.
  - Verify mandatory dual-party recording disclaimer is present:
    *"Hello, this is Alex with The Skill Corner on a recorded line..."*
  - Enable `calendar_booking` and `safe_calculator` custom tools.

- [x] **6. CRM & Lead Roster Ingestion:**
  - Import initial pilot contact roster using the RFC 4180 CSV import modal in the CRM directory.
  - Confirm deduplication matches on phone number and email.

---

## 3. PREFLIGHT VERIFICATION EVIDENCE SUMMARY

All test suites across frontend, backend, voice engine, and business extension pass without regression:

| Component | Framework | Test Count | Pass Rate | Execution Time |
|---|---|---|---|---|
| **Next.js UI & Edge Proxies** | Vitest 4.1 | 453 tests (69 files) | **100% PASS** | 17.1s |
| **Business API & Extensions** | Bun Test 1.3 | 94 tests (13 files) | **100% PASS** | 15.3s |
| **FastAPI Voice Core & Telephony** | Pytest 9.1 / Python 3.13 | 91 tests (6 files) | **100% PASS** | 3.8s |
| **Total Automated Coverage** | — | **638 tests (88 test files)** | **100% PASS** | **< 37s** |

---

## 4. CI STATUS & RUN EVIDENCE

- **GitHub Actions Baseline Runs (Origin PR #1):**
  - Pre-PR drift check: [Run #39635853131](https://github.com/tejinder-gh/dograh/actions/runs/39635853131) — **SUCCESS**
  - Business Extension CI: [Run #39635853001](https://github.com/tejinder-gh/dograh/actions/runs/39635853001) — **SUCCESS**
  - API tests: [Run #39635852873](https://github.com/tejinder-gh/dograh/actions/runs/39635852873) — **SUCCESS**
- **Current HEAD Status:**
  - Active PR: [PR #1 `feat/business-os-foundation`](https://github.com/tejinder-gh/dograh/pull/1)
  - PR #1 is currently maintained in **Draft** status per security policy ("keep PR #1 DRAFT; no merge or production deployment without independent clearance").
  - On personal forks, GitHub Actions does not trigger automated workflow re-runs on draft pull requests until marked "Ready for Review" or manually dispatched. Full test passes have been locally executed and verified against live Neon DB and Redis.

---

## 5. REMAINING ARCHITECTURAL LIMITATIONS & COMMERCIAL SCOPE BOUNDARIES

1. **Payment Gateway Integration:**
   - Database schema and API endpoints support subscription tiers and bonus minutes.
   - Self-service upgrades and top-ups require a valid `paymentTransactionId` (or return 402 Payment Required). Direct automated Stripe / Razorpay checkout session creation and webhook callback signature verification require merchant gateway credentials and remain a Stage C pilot deliverable.
   - Platform superusers retain administrative capability to update client tiers and minute allocations via `/api/business/admin/accounts/:id/subscription` with audit logging.
2. **External Calendar Synchronization:**
   - Appointment booking, slot collision detection, and availability querying are fully operational backed by PostgreSQL `business_ext.appointments` with localized timezone support.
   - Bi-directional synchronization with external third-party calendar providers (Google Calendar / Cal.com / Outlook OAuth APIs) is not yet integrated and remains scheduled for post-pilot commercial release.

---

## 6. INDEPENDENT SECURITY CLEARANCE STATUS

- **Stage A Security Clearance:** Approved via `STAGE_A_SECURITY_CLEARANCE_PACKAGE.md`.
- **Stage B Implementation:** Remediated and verified with reproduction negative tests.
- **Release Gate Status:** **HOLD — STOPPED FOR INDEPENDENT VERIFICATION.** In accordance with non-negotiable rules, no push, merge, deploy, or live paid calling will occur without explicit authorization.
