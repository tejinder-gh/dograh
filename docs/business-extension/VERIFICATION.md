# Stage 1 Security Remediation & Verification Report (Stage A Follow-up)

**Project**: AI Calling Agent OS
**Target Base**: Acuity (`Acuity-hq/Acuity` @ `b677cac4acc6f0dc18010457c98af75e137f8181`)
**Fork Repository**: [https://github.com/tejinder-gh/Acuity](https://github.com/tejinder-gh/Acuity)
**Branch**: `feat/business-os-foundation`
**Pull Request**: [https://github.com/tejinder-gh/Acuity/pull/1](https://github.com/tejinder-gh/Acuity/pull/1) (Draft)
**Review Gate**: Staff Engineer Security Review Gate — Stage A Follow-up (Resolving Blockers 1, 2, 3, 4)
**Status**: Stage A Implementation & Verification Complete — Awaiting Explicit Security Gate Approval

---

## 1. Executive Summary

This report documents the definitive resolution of all four Staff Engineer Stage A follow-up blockers on PR #1:
1. **Blocker 1 (Multi-Instance Replay & Cryptographic Request Binding)**: Eliminated single-process in-memory nonce cache. Implemented shared atomic database replay prevention via `business_ext.consumed_nonces`. Bound internal assertions cryptographically to HTTP method, path, and request body SHA-256 digest. Verified against two distinct service instances and request substitution attacks.
2. **Blocker 2 (Real Next.js Edge Boundary & Two-Account Isolation)**: Replaced mock `NextRequest` tests with genuine HTTP tests over the wire against running Next.js (`http://127.0.0.1:3000`). Tested genuine no-organization session (`selected_organization_id = NULL`), genuine revoked membership (user deleted from `public.organization_users`), multi-org session switching, cookie spoofing, and edge header stripping.
3. **Blocker 3 (Startup Validation & Container Deployment Hardening)**: Added module startup configuration validation failing closed in production for `BUSINESS_EXT_SECRET` and `BUSINESS_API_URL`. Hardened `env.ts` to default `POSTGRES_USER` to `business_app_user`, forbid superuser `postgres` in production, and bind `HOST` to `0.0.0.0` in production for container networking.
4. **Blocker 4 (Database Security Evidence)**: Audited and verified actual deployed PostgreSQL database privileges, schema ownership, table-level grants (strictly `SELECT` on `public`, full DML on `business_ext`), and confirmed PostgreSQL runtime mutation denial (error `42501`).
5. **CI Workflow**: Added `.github/workflows/business-extension-ci.yml` covering `ui/**` and `extensions/business-api/**`.

---

## 2. Blocker 1: Multi-Instance Replay & Cryptographic Request Binding

### 2.1 The Vulnerability
Previously, `signed-assertion.ts` maintained an in-memory `Map<string, number>` of consumed nonces. In a production deployment with multiple worker processes or container replicas, an assertion intercepted in flight could be replayed against another instance. Furthermore, internal assertions contained only tenant and user claims without being bound to the HTTP request itself, allowing an assertion generated for an innocuous `GET` request to be reused for an unauthorized `POST` or `PATCH`.

### 2.2 Architectural Remediation
1. **Shared Atomic Replay Store (`business_ext.consumed_nonces`)**:
   - Created database table `business_ext.consumed_nonces`:
     ```sql
     CREATE TABLE IF NOT EXISTS business_ext.consumed_nonces (
         nonce VARCHAR(128) PRIMARY KEY,
         consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         expires_at TIMESTAMPTZ NOT NULL
     );
     ```
   - Atomic consumption is achieved using `INSERT INTO business_ext.consumed_nonces (nonce, expires_at) VALUES ($1, $2) ON CONFLICT (nonce) DO NOTHING RETURNING nonce;`. If 0 rows are returned, replay is detected and rejected with 401 Unauthorized.
   - **Fail-Closed Behavior**: When atomic nonce storage is unavailable or encounters database connectivity errors, `consumeNonce()` fails closed by propagating the exception. `auth.middleware.ts` catches this and returns `503 Service Unavailable` (`Replay protection store is unavailable`), preventing any mutation from executing without atomic replay verification. Mock store fallbacks are strictly prohibited in production and only accessible via explicit test injection (`setNonceStoreOverrideForTesting`).
2. **Cryptographic Request Binding Claims**:
   - `ui/src/lib/businessAssertion.ts` and `extensions/business-api/src/config/signed-assertion.ts` bind every assertion to the exact HTTP request:
     - `mth`: Uppercase HTTP method (`GET`, `POST`, `PATCH`, `DELETE`).
     - `uri`: Canonical path with sorted query parameters (`normalizeUri`).
     - `bdy`: Hex-encoded SHA-256 digest of the request body (`crypto.createHash('sha256').update(rawBody).digest('hex')`).
   - For requests without bodies (e.g. `GET`), `bdy` is the hash of an empty string.
   - All claims (`mth`, `uri`, `bdy`) are strictly mandatory in `verifyInternalAssertion()`. Missing or tampered claims trigger immediate 401 Unauthorized rejection.
3. **Stream-Safe Verification in `auth.middleware.ts`**:
   - Clones the raw request stream (`c.req.raw.clone().text()`) to verify the digest without consuming the stream for downstream handlers.
   - Normalizes the incoming URL path and sorted query parameters before comparing with the signed `uri` claim.

### 2.3 Automated Test Evidence ([http-security.test.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/Acuity/extensions/business-api/src/tests/integration/http-security.test.ts))
- **Two Distinct Service Instances Replay Prevention**:
  `app1` processes assertion with nonce `N` -> HTTP 201 Created.
  `app2` (separate app instance sharing database) receives identical assertion -> HTTP 401 Unauthorized (`Replay detected: Assertion nonce has already been consumed`). (**PASS**)
- **Method Substitution Attack**:
  Assertion signed for `GET` used on `POST /api/contacts` -> HTTP 401 Unauthorized (`Request method mismatch`). (**PASS**)
- **Path Substitution Attack**:
  Assertion signed for `/api/contacts` used on `/api/contacts/batch` -> HTTP 401 Unauthorized (`Request URI mismatch`). (**PASS**)
- **Body Substitution / Tampering Attack**:
  Assertion signed for body `{"name":"Original Contact"}` presented with body `{"name":"Hacked Contact"}` -> HTTP 401 Unauthorized (`Request body hash mismatch`). (**PASS**)
- **Missing Required Claims Tests**:
  - Missing `mth` claim -> HTTP 401 Unauthorized (`Assertion missing required request method claim`). (**PASS**)
  - Missing `uri` claim -> HTTP 401 Unauthorized (`Assertion missing required request URI claim`). (**PASS**)
  - Missing `bdy` claim -> HTTP 401 Unauthorized (`Assertion missing required request body hash claim`). (**PASS**)
- **Query Parameter Normalization & Tampering Tests**:
  - Tampered query parameter (`page=1` changed to `page=2`) -> HTTP 401 Unauthorized (`Request URI mismatch`). (**PASS**)
  - Permuted query parameters (`page=1&limit=10` vs `limit=10&page=1`) -> HTTP 200 OK via canonical query sorting. (**PASS**)
- **Fail-Closed Replay Store Fault Injection**:
  Simulated PostgreSQL pool exhaustion / unreachable nonce store -> HTTP 503 Service Unavailable (`Replay protection store is unavailable`). Confirmed 0 rows inserted into `business_ext.contacts`. (**PASS**)

---

## 3. Blocker 2: Real Next.js Boundary & Session Tests

### 3.1 The Vulnerability
Previous tests invoked Next.js route handlers directly via constructed `NextRequest` objects in Vitest. This bypassed the actual HTTP server, middleware, cookie parsing pipeline, and network stack. Furthermore, tests used synthetic fake tokens rather than testing genuine Acuity database states.

### 3.2 Real HTTP Test Suite ([business-auth.test.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/Acuity/ui/src/app/api/business/business-auth.test.ts))
Executed over the wire against the running Next.js dev server on `http://127.0.0.1:3000` backed by Acuity core and PostgreSQL:

```bash
bun run test -- src/app/api/business/business-auth.test.ts
```

| Test Description | Execution Mechanism | Result | Status |
| :--- | :--- | :--- | :--- |
| **Forged `OSS_USER` Cookie without Token** | Wire HTTP `GET /api/business/contacts` with `Cookie: OSS_USER={...}` | 401 Unauthorized | **PASS** |
| **Forged `OSS_USER` Cookie with Valid Token** | Wire HTTP `POST /api/business/contacts` with Org A token + forged Org B cookie | 201 Created in Org A; Org B query returns 0 contacts | **PASS** |
| **Malformed / Tampered Bearer Token** | Wire HTTP `GET /api/business/contacts` with `Authorization: Bearer invalid.tampered.token` | 401 Unauthorized | **PASS** |
| **Genuine User Session with No Organization (A1.4)** | Real user `553` in `public.users` with `selected_organization_id = NULL` | 401 Unauthorized (`missing active organization`) | **PASS** |
| **Genuine Revoked Organization Membership (A1.5)** | Real user `554` with valid token targeting Org 501, removed from `public.organization_users` | 403 Forbidden (`User is not an active member of the specified organization`) | **PASS** |
| **Real Session Switching Across Organizations** | User `551` switches `selected_organization_id` in database from 501 to 502, then back | 404 Not Found when switched to Org 502; 200 OK when restored to Org 501 | **PASS** |
| **Two-Account Cross-Tenant Isolation** | Org B attempts direct `GET`, `PATCH`, and `DELETE` on Org A contact UUID | All three operations return 404 Not Found | **PASS** |
| **Edge Header Stripping** | Client supplies malicious `X-Internal-Assertion` and `X-Acuity-Organization-Id` | Headers stripped at edge; Next.js generates genuine assertion; 200 OK | **PASS** |

---

## 4. Blocker 3: Startup Validation & Deployment Hardening

### 4.1 UI Startup Environment Validation ([businessApiServer.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/Acuity/ui/src/lib/businessApiServer.ts))
- Implemented `validateConfiguration()` executed at module load time.
- In production (`NODE_ENV === 'production'`):
  - Fails closed immediately if `BUSINESS_EXT_SECRET` is missing, shorter than 32 characters, or matches any known placeholder.
  - Fails closed immediately if `BUSINESS_API_URL` is omitted (disallowing localhost loopback fallbacks in production).
  - Strictly reads `Acuity_DEPLOYMENT_ID` from server environment.

### 4.2 Business API Production Configuration ([env.ts](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/Acuity/extensions/business-api/src/config/env.ts))
- **Non-Superuser Default**: `POSTGRES_USER` defaults to `business_app_user` (not `postgres`).
- **Superuser Prohibition**: In production, Zod `.superRefine` enforces that neither `DATABASE_URL` nor `POSTGRES_USER` can connect as `postgres`.
- **Container Network Binding**: `HOST` defaults to `0.0.0.0` in production (enabling private bridge network routing between Next.js and Business API containers) and `127.0.0.1` in development.

---

## 5. Blocker 4: Database Security Evidence

Audited directly against active PostgreSQL database roles and permissions:

### 5.1 Role Attributes (`pg_roles`)
```sql
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin
FROM pg_roles
WHERE rolname IN ('postgres', 'ai_calling_owner', 'business_app_user');
```
```
      rolname      | rolsuper | rolinherit | rolcreaterole | rolcreatedb | rolcanlogin
-------------------+----------+------------+---------------+-------------+-------------
 postgres          | t        | t          | t             | t           | t
 ai_calling_owner  | f        | t          | t             | t           | t
 business_app_user | f        | t          | f             | f           | t
```
*Note on Neon Role Audit*: `business_app_user` in Neon possesses `rolsuper=false`, `rolcreaterole=false`, `rolcreatedb=false`, and `rolinherit=true` (standard PostgreSQL role inheritance default), strictly lacking all administrative and database creation privileges.

### 5.2 Schema Ownership (`pg_namespace`)
```sql
SELECT n.nspname AS schema_name, r.rolname AS owner
FROM pg_namespace n
JOIN pg_roles r ON n.nspowner = r.oid
WHERE n.nspname IN ('public', 'business_ext');
```
```
 schema_name  |       owner
--------------+-------------------
 public       | pg_database_owner
 business_ext | business_app_user
```

### 5.3 Table Privileges Audit (`information_schema.role_table_grants`)
- Querying all grants for `grantee = 'business_app_user'`:
  - **`business_ext.*` (6 tables)**: Full DML `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE`.
  - **`public.*` (31 tables)**: Strictly `SELECT` only. Zero `INSERT`, zero `UPDATE`, zero `DELETE`, zero `TRUNCATE`.

### 5.4 Runtime Mutation Denial (Postgres Error 42501 Evidence)
Automated in `database-privileges.test.ts` executing directly as `business_app_user`:
- `INSERT INTO public.workflows` -> Throws code `42501` (permission denied for table workflows). (**PASS**)
- `UPDATE public.organizations` -> Throws code `42501` (permission denied for table organizations). (**PASS**)
- `DELETE FROM public.users` -> Throws code `42501` (permission denied for table users). (**PASS**)

---

## 6. Complete Verification Test Suite Execution Results

### 6.1 `ui` Test Suite (Vitest)
```bash
cd ui && bun run test
```
```
 Test Files  63 passed (63)
      Tests  418 passed (418)
   Duration  15.67s
```

### 6.2 `extensions/business-api` Test Suite (Bun Test)
```bash
cd extensions/business-api && bun test
```
```
 59 pass
 0 fail
 183 expect() calls
Ran 59 tests across 8 files. [8.07s]
```
All 8 test files:
- `scoring.test.ts` (6 tests passed)
- `validation.test.ts` (8 tests passed)
- `http-security.test.ts` (20 tests passed, including multi-instance replay, fail-closed fault-injection, and method/path/body/query claim verification)
- `database-privileges.test.ts` (9 tests passed)
- `tenant-mapping.test.ts` (3 tests passed)
- `crm-isolation.test.ts` (6 tests passed)
- `interaction-run.test.ts` (2 tests passed)
- `business-profile.test.ts` (5 tests passed)

### 6.3 CI Actions Workflow
Updated [.github/workflows/business-extension-ci.yml](file:///Users/tejindersingh/dev/AI/agents/mentize/AI%20calling%20agent%20OS/Acuity/.github/workflows/business-extension-ci.yml) targeting PR branches touching `ui/**` and `extensions/business-api/**`. Uses full authoritative Acuity schema dump and separated unprivileged runtime (`business_app_user`) vs migration/admin (`postgres`) roles.

---

## 7. Stopping Rule Compliance

> [!IMPORTANT]
> **Stage A Security Gate Halt**: All Stage A corrections (Blockers 1, 2, 3, and 4) are implemented and verified with authentic wire HTTP requests, atomic PostgreSQL replay store, cryptographic request binding, and least-privilege database roles. In accordance with Staff Engineer instructions, **no Stage B work (call outcomes, lead score inflation hardening) or Stage 2 work (escalation webhooks, live telephony integration) has been started**. The PR remains in DRAFT awaiting Staff Engineer evaluation and explicit clearance.
