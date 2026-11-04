# ACUITY AI CALLING AGENT OS — PRODUCTION OPERATIONS RUNBOOK (OPS-01)

**Version:** 1.0.0  
**Target Environment:** Commercial Production & Managed Cloud Pilots (`equity.skillcorner.com` / `equity.theskillcorner.com`)  
**Scope:** Architecture, Incident Response, Container Lifecycle, Secret Rotation, Disaster Recovery, Observability.

---

## 1. COMPONENT ARCHITECTURE & TOPOLOGY

Acuity AI Calling Agent OS consists of five containerized services orchestrated via Docker / Kubernetes:

| Service | Technology | Internal Port | External Port | Healthcheck | Role |
|---|---|---|---|---|---|
| `ui` | Next.js 15 / React 19 / TypeScript | 3010 | 3010 (via Nginx 443) | `wget --spider http://127.0.0.1:3010` | Web UI, SSR, Edge Proxy, HMAC assertion issuer |
| `api` | FastAPI / Python 3.13 / Pipecat | 8000 | 8000 (via Nginx 443) | `http://localhost:8000/api/v1/health` | Voice orchestration, STT/TTS pipeline, Telephony WS |
| `business-api` | Hono / Bun / TypeScript | 4000 | Internal only | `curl -f http://127.0.0.1:4000/health` | Multi-tenant CRM, Appointments, Subscription metering |
| `postgres` | Neon PostgreSQL (or pgvector pg17) | 5432 | 5432 | `pg_isready -U postgres` | Isolated `public` and `business_ext` database schemas |
| `redis` | Redis 7 Alpine | 6379 | 6379 | `redis-cli ping` | Voice session caching, ARQ queue, rate limiting |
| `minio` | MinIO Object Storage | 9000, 9001 | 9000, 9001 | `curl -f http://localhost:9000/minio/health/live` | Encrypted call audio recordings & transcripts |

```
                              [ Internet / Public Ingress ]
                                            │
                                ┌───────────┴───────────┐
                                │   Nginx / Cloudflare  │
                                └───────────┬───────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
            ┌─────────────────┐                           ┌─────────────────┐
            │     Next.js     │──[ HMAC Assertion JWT ]──>│  Business API   │
            │   Frontend/UI   │    (SHA-256 Nonce Bound)  │ (Port 4000, Bun)│
            └────────┬────────┘                           └────────┬────────┘
                     │                                             │
                     ▼                                             ▼
            ┌─────────────────┐                           ┌─────────────────┐
            │ FastAPI / Voice │<──[ Quota & Telephony ]──>│ Neon PostgreSQL │
            │ Pipeline (8000) │                           │  (Isolated DB)  │
            └────────┬────────┘                           └─────────────────┘
                     │
            ┌────────┴────────┐
            ▼                 ▼
      [ Redis 7 ]       [ MinIO Audio ]
```

---

## 2. INCIDENT SEVERITY & ESCALATION MATRIX

| Severity | Definition | Target MTTA | Target MTTR | Escalation Lead |
|---|---|---|---|---|
| **SEV-0 (Catastrophic)** | Total platform outage, cross-tenant data leak, active security breach, complete call failure across all carriers. | < 5 mins | < 30 mins | Security Architect & Head of Infrastructure |
| **SEV-1 (Critical)** | Primary carrier failure (e.g. Twilio down), Business API unreachable, billing/quota metering offline, appointment booking failing. | < 15 mins | < 1 hour | Staff SRE & Telephony Lead |
| **SEV-2 (Major)** | Single-tenant degradation, degraded latency (P99 TTFS > 800ms), CSV lead import failure, non-critical webhook backlog. | < 30 mins | < 4 hours | Senior Backend Engineer |
| **SEV-3 (Minor)** | Minor UI layout defects, non-blocking admin reporting delay, transient transient single-call audio artifact. | < 2 hours | < 24 hours | On-Call Developer |

---

## 3. COMPONENT FAILURE & CONTAINER RECOVERY RUNBOOKS

### 3.1 Business API Failure (`business-api`)
**Symptoms:** Next.js CRM views return 502/504; calls failing quota checks with `quota_check_failed`.  
**Diagnostic Command:**
```bash
docker compose logs --tail=100 -f business-api
```
**Recovery Steps:**
1. Check container health status:
   ```bash
   docker inspect --format='{{json .State.Health}}' $(docker compose ps -q business-api)
   ```
2. If memory exhausted or stuck event loop, restart container gracefully:
   ```bash
   docker compose restart business-api
   ```
3. Verify advisory locks and schema migrations did not stall:
   ```bash
   psql "$MIGRATION_DATABASE_URL" -c "SELECT pid, query, age(clock_timestamp(), query_start) FROM pg_stat_activity WHERE query LIKE '%advisory_lock%';"
   ```
4. Confirm healthcheck returns 200 OK:
   ```bash
   docker compose exec business-api curl -f http://127.0.0.1:4000/health
   ```

### 3.2 Voice Core / Telephony WebSocket Failure (`api`)
**Symptoms:** Incoming telephony calls rejected with 4401 or 4409; call audio silent; P99 TTFS spikes.  
**Diagnostic Command:**
```bash
docker compose logs --tail=150 -f api | grep -E "ERROR|CRITICAL|telephony"
```
**Recovery Steps:**
1. Verify `TELEPHONY_WS_TOKEN_SECRET` matches across UI, API, and webhook minting services.
2. Check Redis connection pool health:
   ```bash
   docker compose exec redis redis-cli ping
   ```
3. Restart API workers:
   ```bash
   docker compose restart api
   ```
4. Verify audio pipeline latency constant is healthy:
   ```bash
   docker compose exec api python -c "from pipecat.services.stt_latency import DOGRAH_TTFS_P99; print('TTFS constant:', DOGRAH_TTFS_P99)"
   ```

### 3.3 Database Connection Pool Exhaustion (`postgres`)
**Symptoms:** `connection limit exceeded for non-superusers` or 500 errors across services.  
**Recovery Steps:**
1. Inspect active connections by user and database:
   ```bash
   psql "$MIGRATION_DATABASE_URL" -c "SELECT usename, count(*) FROM pg_stat_activity GROUP BY usename;"
   ```
2. Terminate idle in transaction connections older than 2 minutes:
   ```bash
   psql "$MIGRATION_DATABASE_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND age(clock_timestamp(), state_change) > interval '2 minutes';"
   ```
3. Ensure application connects using connection pooling (Neon pooled endpoint `ep-*-pooler`).

---

## 4. SECRET ROTATION PROCEDURES

### 4.1 Internal Service Assertion Secret (`BUSINESS_EXT_SECRET`)
The `BUSINESS_EXT_SECRET` protects internal requests between Next.js and Business API with SHA-256 HMAC tokens.

**Zero-Downtime Rotation Procedure:**
1. Generate cryptographically random 256-bit secret:
   ```bash
   openssl rand -hex 32
   ```
2. Update `dograh/.env` and Docker container environment for `business-api` first.
3. Update `ui` container environment with the new secret.
4. Restart services with rolling replacement:
   ```bash
   docker compose up -d --no-deps business-api
   docker compose up -d --no-deps ui
   ```
5. Test assertion validation:
   ```bash
   docker compose exec ui bun test src/app/api/business/admin/session/route.test.ts
   ```

### 4.2 Web User JWT Secret (`OSS_JWT_SECRET`)
1. Generate new 32+ character secret:
   ```bash
   openssl rand -hex 32
   ```
2. Note: Rotating `OSS_JWT_SECRET` invalidates existing browser session cookies, requiring active users to re-login.
3. Apply to `api` and `ui` services and restart:
   ```bash
   docker compose up -d --no-deps api ui
   ```

### 4.3 Telephony Capability Secret (`TELEPHONY_WS_TOKEN_SECRET`)
1. Mint new secret.
2. Update `api` container. Outbound webhook calls mint tokens with the new secret immediately.
3. Existing in-flight calls (within 5-minute TTL) finish normally before old token window closes.

---

## 5. DATABASE BACKUP, SNAPSHOTTING & DISASTER RECOVERY

### 5.1 Automated Point-in-Time Recovery (PITR)
Neon PostgreSQL maintains automated write-ahead log (WAL) archiving allowing point-in-time branch restores:
1. To restore to a specific timestamp, create a child branch from the parent branch at the desired restore point via Neon Console or Neon CLI.
2. Update `DATABASE_URL` and `MIGRATION_DATABASE_URL` in `.env` with the restored endpoint.
3. Restart all services.

### 5.2 Schema Backup (`pg_dump`)
Run daily scheduled backup of isolated `business_ext` and `public` schemas:
```bash
pg_dump "$MIGRATION_DATABASE_URL" \
  --schema=business_ext \
  --schema=public \
  --format=custom \
  --file="backup_acuity_$(date +%Y%m%d_%H%M%S).dump"
```

### 5.3 Rollback Execution
To restore from a logical dump:
```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$MIGRATION_DATABASE_URL" \
  backup_acuity_*.dump
```

---

## 6. OBSERVABILITY, METRICS & ALERTING

### 6.1 Prometheus Scraping Configuration
Add the following scrape targets to Prometheus:

```yaml
scrape_configs:
  - job_name: 'acuity-api'
    metrics_path: '/api/v1/metrics'
    scrape_interval: 15s
    static_configs:
      - targets: ['api:8000']

  - job_name: 'acuity-business-api'
    metrics_path: '/metrics'
    scrape_interval: 15s
    static_configs:
      - targets: ['business-api:4000']
```

### 6.2 Key SLO Metrics & Alerting Thresholds

| Metric | Target / SLO | Warning Alert | Critical Alert (PagerDuty) |
|---|---|---|---|
| **STT/TTS Latency (TTFS P99)** | < 350ms | > 500ms for 2 min | > 800ms for 1 min |
| **Call Drop / Hangup Error Rate** | < 0.5% | > 1.0% | > 3.0% |
| **HTTP Error Rate (5xx)** | < 0.1% | > 0.5% | > 2.0% |
| **Concurrency Saturation** | < 75% capacity | > 80% capacity | > 95% capacity |
| **Redis Memory Utilization** | < 70% | > 75% | > 90% |
| **Replay Attack / Rate Limit Spike** | 0 spikes | > 20 req/s to /auth | > 50 req/s to /auth |

---

## 7. AUDIT COMPLIANCE & INCIDENT REPORT TEMPLATE
In the event of a SEV-0 or SEV-1 incident, complete an incident post-mortem within 24 hours including:
- Root cause mechanism and trigger.
- Total customer impact (calls affected, tenants affected).
- Verification tests created to prevent regression.
- Corrective actions completed before commercial sign-off.
