# Legacy AI Calling Agent OS Codebase

This directory contains the original AI Calling Agent OS implementation (previously hosted in `AI-calling-AGent`), archived here as part of the consolidation into **Dograh** as the sole primary repository.

## Purpose

As documented in [`docs/business-extension/ARCHITECTURE.md`](../../docs/business-extension/ARCHITECTURE.md) and [`docs/business-extension/MIGRATION_MATRIX.md`](../../docs/business-extension/MIGRATION_MATRIX.md), Dograh provides the mature core platform (FastAPI, Next.js UI, Pipecat voice runtime, telephony bridges, workflow editor).

This legacy codebase is preserved directly inside the repository for developer reference during future migration phases:
- **`src/services/connectors/` & `src/routes/marketplace.routes.ts`**: Reference for Stage 3 commercial tool marketplace connectors (Google Calendar, CRM, Telephony, MCP).
- **`src/components/marketplace/` & `src/components/CrmDirectory.tsx`**: Reference for UI workflows being transitioned to Dograh's Next.js application.
- **`migrations/`**: Reference for earlier database schemas and catalog seeds.

## Status

- **Archival Date**: October 2026
- **Primary Service**: Commercial business capabilities are actively implemented under [`extensions/business-api/`](../../extensions/business-api/).
- **Voice Runtime**: Handled natively by Dograh (`api/` and `pipecat/`).
