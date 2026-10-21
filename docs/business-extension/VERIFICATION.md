# Stage 1 Security Remediation & Verification Report (Stage A)

**Project**: AI Calling Agent OS  
**Target Base**: Dograh (`dograh-hq/dograh` @ `b677cac4acc6f0dc18010457c98af75e137f8181`)  
**Fork Repository**: [https://github.com/tejinder-gh/dograh](https://github.com/tejinder-gh/dograh)  
**Branch**: `feat/business-os-foundation`  
**Pull Request**: [https://github.com/tejinder-gh/dograh/pull/1](https://github.com/tejinder-gh/dograh/pull/1) (Draft)  
**Review Gate**: Staff Engineer Security Review Gate for Stage A (P0-1, P0-2, P1-4, P1-5)  
**Status**: Stage A Implementation & Verification Complete — Awaiting Security Gate Approval  

---

## 1. Executive Summary & Scope Regression Resolution

This report details the resolution of all critical security vulnerabilities, trust boundary defects, and privilege hazards raised during the Staff Engineer reviews (#5593918140 and follow-up on HEAD `74f60f31`).

### 1.1 Resolution of PR Scope Regression
- **Issue**: Commit `74f60f31` accidentally introduced the legacy codebase archive under `legacy/ai-calling-agent/`, inflating the PR diff from 63 to 155 files (+29,414 lines).
- **Remediation**: Executed full revert commit `43c2c1f6` (`revert: remove legacy/ai-calling-agent archive to resolve PR scope regression`), eliminating all 92 legacy archive files (-23,285 lines).
- **Current State**: The PR contains only files strictly relevant to the Business Extension Foundation, its proxy boundary, and associated documentation/tests.

---

## 2. P0-1: Elimination of Forgeable Organization Identity

### 2.1 Failure Mechanism Identified
In the previous implementation, `businessApiServer.ts` invoked `getServerUser()`, which extracted the user and organization identity from the `OSS_USER` cookie. Because the `OSS_USER` cookie is an unverified, client-writable JSON object in Dograh OSS mode, an attacker could forge the `organizationId` payload to impersonate any organization while providing an absent, expired, or foreign `OSS_TOKEN`.

### 2.2 Architectural Remediation
1. **Zero Trust in `OSS_USER` Cookie**: `ui/src/lib/businessApiServer.ts` now completely ignores the `OSS_USER` cookie for authorization.
2. **Mandatory Dograh Core `/auth/me` Session Verification**: On **every** request to `/api/business/*`, `getVerifiedSession(req)` extracts the token from the `Authorization: Bearer` header or `OSS_TOKEN_COOKIE`. It then makes an authoritative call to Dograh's backend at `GET /api/v1/auth/me`.
3. **Strict Validation**: If the token is missing, expired, invalid, or belongs to a user without an active selected organization, the request is immediately rejected at the Next.js edge with `401 Unauthorized`.
4. **Header Anti-Spoofing**: Any incoming headers such as `X-Dograh-Organization-Id`, `X-Dograh-User-Id`, or `X-Internal-Assertion` supplied by the browser or external caller are explicitly stripped before forwarding.

### 2.3 Real Adversarial Test Coverage
Implemented in checked-in test suite [business-auth.test.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/dograh/ui/src/app/api/business/business-auth.test.ts), which exercises actual Next.js route handlers (`POST /api/business/contacts`, `GET /api/business/contacts/[id]`, etc.):
- **A1.1**: Forged `OSS_USER` cookie with no token -> `401 Unauthorized` (**PASS**).
- **A1.2**: Valid Org A token paired with forged Org B `OSS_USER` cookie -> operates strictly on Org A, completely ignoring Org B cookie claims (**PASS**).
- **A1.3**: Cryptographically invalid or expired token -> `401 Unauthorized` (**PASS**).
- **A1.4**: Session without active organization -> `401 Unauthorized` (**PASS**).
- **A1.5**: User without membership in requested organization -> `401 Unauthorized` (**PASS**).
- **A1.6**: Completely missing session -> `401 Unauthorized` (**PASS**).
- **A1.7**: Valid Org A session successfully executes authorized operations (**PASS**).

---

## 3. P0-2: Hardening Internal Business API Authentication

### 3.1 Failure Mechanism Identified
Previously, both `ui` and `extensions/business-api` fell back to a shared default secret `BUSINESS_EXT_SECRET = 'dev_dograh_extension_secret_change_in_prod'`, allowing any entity with access to the default secret to craft requests asserting arbitrary `X-Dograh-Organization-Id` and `X-Dograh-Deployment-Id` headers. Furthermore, the Business API listened on all interfaces without host binding.

### 3.2 Architectural Remediation
1. **Mandatory High-Entropy Secret & Rejection of Insecure Defaults**:
   - `extensions/business-api/src/config/env.ts` enforces `BUSINESS_EXT_SECRET` minimum length of 32 characters via Zod.
   - Hardcoded rejection of known insecure/default secrets (`KNOWN_INSECURE_SECRETS`).
   - Service fails closed at startup if secret is missing, too short, or matches a default placeholder.
2. **Cryptographically Signed Scoped Assertions (`X-Internal-Assertion`)**:
   - Instead of static shared secrets and arbitrary caller headers, the Next.js server signs a short-lived (60s) HMAC-SHA256 JWT assertion ([businessAssertion.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/dograh/ui/src/lib/businessAssertion.ts)).
   - Claims: `{ sub: userId, org: organizationId, dep: configuredDeploymentId, aud: 'dograh-business-api', iss: 'dograh-ui-server', nonce: randomUUID, exp, iat }`.
   - Deployment ID is bound strictly by server configuration (`DOGRAH_DEPLOYMENT_ID`), never caller-selected.
3. **Replay Cache & Signature Verification**:
   - Business API validates assertion signature, expiration, audience, and issuer ([signed-assertion.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/dograh/extensions/business-api/src/config/signed-assertion.ts)).
   - In-memory nonce cache ensures single-use execution and rejects duplicate/replayed assertions with `401 Unauthorized`.
4. **Database-Level Membership Verification**:
   - `auth.middleware.ts` queries Dograh core `public.organization_users` to verify the user has an active membership in the asserted organization, protecting against stale tokens or revoked access.
   - Queries `public.organizations` to ensure the organization exists and is active.
5. **Private Ingress Binding**:
   - `extensions/business-api/src/server.ts` binds strictly to `127.0.0.1` (`env.HOST`).

### 3.3 Test Verification
Tested in [http-security.test.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/dograh/extensions/business-api/src/tests/integration/http-security.test.ts):
- Direct probe missing `X-Internal-Assertion` -> `401 Unauthorized` (**PASS**).
- Startup fails if secret is weak or default (**PASS**).
- Assertion with tampered organization claim -> `401 Unauthorized` (**PASS**).
- Assertion with tampered deployment ID -> `401 Unauthorized` (**PASS**).
- Expired assertion -> `401 Unauthorized` (**PASS**).
- Replayed assertion (duplicate request with identical nonce) -> `401 Unauthorized` (**PASS**).
- User not in `public.organization_users` -> `403 Forbidden` (**PASS**).

---

## 4. P1-4: Database Least-Privilege Role & Migration Safety

### 4.1 Role Privilege Hardening
- Runtime user `business_app_user`:
  - `rolsuper = false`, `rolcreaterole = false`, `rolcreatedb = false`, `rolinherit = false`.
- **Dograh `public` Schema**:
  - Granted: `SELECT` only on Dograh tables (`organizations`, `workflows`, `workflow_definitions`, `workflow_runs`, `users`, `organization_users`).
  - Denied: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `CREATE` are all strictly revoked.
  - Revoked all broad permissions in `dograh_business_test`.
- **Extension `business_ext` Schema**:
  - `business_app_user` has `USAGE` and table-level `SELECT, INSERT, UPDATE, DELETE` on `business_ext.*`.
  - `CREATE` schema privilege was revoked from runtime `business_app_user`.

### 4.2 Migration Transaction Atomicity & Concurrency Safety
- Removed runtime migration DDL execution from `server.ts` startup.
- `extensions/business-api/src/config/migrator.ts` executes migrations within an atomic PostgreSQL transaction (`BEGIN ... COMMIT / ROLLBACK`).
- Uses transaction-level advisory locking (`SELECT pg_advisory_xact_lock(718291)`) to prevent concurrent startup races.
- If already applied, migrations do not re-run SQL.
- If a migration statement fails, the transaction rolls back cleanly without writing a record to `schema_migrations`.

### 4.3 Database Privileges Test Suite
Tested in [database-privileges.test.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/dograh/extensions/business-api/src/tests/integration/database-privileges.test.ts):
- Verifies `business_app_user` is not superuser (**PASS**).
- Verifies zero `CREATE` privilege on `public` and `business_ext` (**PASS**).
- Verifies `has_table_privilege` is `SELECT` only on core Dograh tables (**PASS**).
- Verifies `information_schema.role_table_grants` contains 0 non-SELECT grants on `public` (**PASS**).
- Verifies runtime attempts to `INSERT` on `public.workflows` fails with PostgreSQL code `42501` (**PASS**).
- Verifies runtime attempts to `UPDATE` on `public.organizations` fails with PostgreSQL code `42501` (**PASS**).
- Verifies runtime attempts to `DELETE` on `public.users` fails with PostgreSQL code `42501` (**PASS**).
- Verifies migration transaction atomic rollback on failure (**PASS**).
- Verifies concurrent migration executions do not race (**PASS**).

---

## 5. Requirement-to-Code-to-Test Mapping Table

| Requirement | Implementation Module | Automated Test File | Test Case | Status |
| :--- | :--- | :--- | :--- | :--- |
| **P0-1**: No reliance on unverified `OSS_USER` cookie | `ui/src/lib/businessApiServer.ts` (`getVerifiedSession`) | `ui/src/app/api/business/business-auth.test.ts` | `A1.1: Forged OSS_USER cookie with no valid token` | **PASS** |
| **P0-1**: Mandatory Dograh backend `/auth/me` verification | `ui/src/lib/businessApiServer.ts` (`getVerifiedSession`) | `ui/src/app/api/business/business-auth.test.ts` | `A1.3: Expired or cryptographically invalid token denied` | **PASS** |
| **P0-1**: Prevent cross-tenant identity spoofing | `ui/src/lib/businessApiServer.ts` | `ui/src/app/api/business/business-auth.test.ts` | `A1.2: Valid Org A token with forged Org B cookie operates strictly on Org A` | **PASS** |
| **P0-1**: Cross-tenant contact isolation | `ui/src/lib/businessApiServer.ts` & Next.js routes | `ui/src/app/api/business/business-auth.test.ts` | `A1.7: Valid Org A session executes authorized operations` | **PASS** |
| **P0-2**: Prohibit default/short secrets at startup | `extensions/business-api/src/config/env.ts` | `extensions/business-api/src/tests/integration/http-security.test.ts` | `enforces environment configuration fails validation if secret insecure` | **PASS** |
| **P0-2**: Cryptographic assertion authentication | `ui/src/lib/businessAssertion.ts` & `signed-assertion.ts` | `extensions/business-api/src/tests/integration/http-security.test.ts` | `rejects direct request missing X-Internal-Assertion header` | **PASS** |
| **P0-2**: Assertion tamper resistance | `extensions/business-api/src/config/signed-assertion.ts` | `extensions/business-api/src/tests/integration/http-security.test.ts` | `rejects assertion with tampered organization claim` | **PASS** |
| **P0-2**: Server-bound deployment ID | `extensions/business-api/src/config/signed-assertion.ts` | `extensions/business-api/src/tests/integration/http-security.test.ts` | `rejects assertion with mismatched/tampered deployment ID` | **PASS** |
| **P0-2**: Nonce cache replay protection | `extensions/business-api/src/config/signed-assertion.ts` | `extensions/business-api/src/tests/integration/http-security.test.ts` | `prevents replay of consequential request (duplicate blocked)` | **PASS** |
| **P0-2**: Organization membership verification | `extensions/business-api/src/adapters/dograh-api.adapter.ts` | `extensions/business-api/src/tests/integration/http-security.test.ts` | `rejects assertion if user is not a member of organization` | **PASS** |
| **P1-4**: Non-superuser runtime role | PostgreSQL `business_app_user` | `extensions/business-api/src/tests/integration/database-privileges.test.ts` | `verifies business_app_user is not superuser` | **PASS** |
| **P1-4**: Strictly read-only on Dograh `public.*` | PostgreSQL role grants | `extensions/business-api/src/tests/integration/database-privileges.test.ts` | `verifies business_app_user has strictly SELECT only on public tables` | **PASS** |
| **P1-4**: Runtime mutation rejection (42501) | PostgreSQL permissions | `extensions/business-api/src/tests/integration/database-privileges.test.ts` | `rejects INSERT into public.workflows with 42501` | **PASS** |
| **P1-4**: No runtime CREATE on schemas | PostgreSQL namespace privileges | `extensions/business-api/src/tests/integration/database-privileges.test.ts` | `verifies business_app_user has NO CREATE on public or business_ext` | **PASS** |
| **P1-4**: Transactional migration rollback | `extensions/business-api/src/config/migrator.ts` | `extensions/business-api/src/tests/integration/database-privileges.test.ts` | `rolls back atomically and does not record migration ID if fails` | **PASS** |
| **P1-4**: Advisory lock concurrency safety | `extensions/business-api/src/config/migrator.ts` | `extensions/business-api/src/tests/integration/database-privileges.test.ts` | `two concurrent migration executions do not race` | **PASS** |
| **P1-5**: Real Next.js route integration suite | `ui/src/app/api/business/**` | `ui/src/app/api/business/business-auth.test.ts` | Full suite (7 tests) against real route handlers | **PASS** |

---

## 6. Verification Test Suite Execution Results

### 6.1 `ui` Test Suite (Vitest)
```bash
bun run test
```
- **Test Files**: 63 passed (63 total)
- **Tests**: 417 passed (417 total)
- **Failures**: 0
- **Duration**: 5.31s

### 6.2 `extensions/business-api` Test Suite (Bun Test)
```bash
bun test
```
- **Test Files**: 8 passed (8 total)
  - `scoring.test.ts` (6 tests)
  - `validation.test.ts` (8 tests)
  - `http-security.test.ts` (10 tests)
  - `database-privileges.test.ts` (9 tests)
  - `tenant-mapping.test.ts` (3 tests)
  - `crm-isolation.test.ts` (6 tests)
  - `interaction-run.test.ts` (2 tests)
  - `business-profile.test.ts` (5 tests)
- **Tests**: 49 passed (49 total)
- **Failures**: 0
- **Duration**: 196ms

### 6.3 TypeScript Typechecking
```bash
bun run typecheck (in extensions/business-api)
```
- Output: Clean exit code 0 (`tsc --noEmit`).

---

## 7. Honest Reporting of Unverified Checks & Environment Disclaimers

1. **GitHub Actions Workflow Runs**:
   - Upstream Dograh workflows (`.github/workflows/api-tests.yml`) specify path triggers limited strictly to `api/**`, `pipecat/**`, and `scripts/**`.
   - Consequently, PR commits touching only `ui/**` and `extensions/business-api/**` do not trigger the upstream Python backend test action.
   - All 466 integration and unit tests reported in this document were executed locally against live containerized services (`postgres:17`, `redis:7`, Dograh API `:8000`, Business API `:4000`).
2. **Credential Rotation Report**:
   - All exposed development passwords and placeholders previously visible in local session logs were rotated to high-entropy 64-character hex strings in `.env` configurations.
   - No plaintext passwords, API keys, or raw JWT tokens are recorded in commit history, PR comments, or documentation.

---

## 8. Stopping Rule Compliance

> [!IMPORTANT]
> **Stage A Security Gate Halt**: All Stage A corrections (P0-1, P0-2, P1-4, P1-5, and scope regression cleanup) are complete and verified. In accordance with Staff Engineer instructions, **no Stage B work (call outcomes, lead score inflation hardening) or Stage 2 work (escalation webhooks, live telephony integration) has been started**. We are awaiting explicit Staff Engineer evaluation and gate clearance.
