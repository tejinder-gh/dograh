# AI Calling Agent OS — Local Development Setup

Simplified, pre-production development environment for AI Calling Agent OS on Acuity.

## Target Architecture

- **Next.js Frontend**: Port 3000 (`http://localhost:3000`)
- **Acuity FastAPI**: Port 8000 (`http://localhost:8000`) for voice, workflows, telephony, and authentication
- **Business Extension API**: Port 4000 (`http://localhost:4000`) for CRM and business operations
- **Database Backend**: Managed Neon PostgreSQL (`ai_calling_os` in project `twilight-haze-75311315`), housing both Acuity's `public` schema and the `business_ext` schema
- **Cache & Storage**: Containerized Redis (6379) and MinIO (9000/9001) for Acuity audio and task queues

Redundant duplicate frontend container (port 3010) and local PostgreSQL container (port 5432) have been permanently decommissioned.

## Access URLs

- **App Frontend**: http://localhost:3000
- **API Health**: http://localhost:8000/api/v1/health
- **API Documentation**: http://localhost:8000/docs
- **Business API Health**: http://localhost:4000/health
- **MinIO Web Console**: http://localhost:9001

## Quick Start (Consolidated Development Command)

From the project root:

```bash
# Start all services (Docker support services + Business API + Next.js UI)
./dev.sh start

# Check health and status matrix
./dev.sh status

# Run comprehensive regression and security test suites
./dev.sh test

# Stop all local development services cleanly
./dev.sh stop
```

## Security & Database Credential Separation

- **Migration / DDL Role**: `ai_calling_owner` (used for Alembic and `business_ext` schema migrations)
- **Runtime Least-Privilege Role**: `business_app_user` (restricted to DML on `business_ext` tables; strictly SELECT-only on Acuity `public` tables; cannot DROP or ALTER tables)
- Credentials are read securely from local `.env` and `extensions/business-api/.env` files and are never committed to version control.
