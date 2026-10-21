#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

ACTION="${1:-start}"

function status() {
  echo "=== AI Calling Agent OS Service Matrix ==="
  echo ""
  echo "Docker Support Services (Acuity API, Redis, MinIO):"
  ./local.sh ps || true
  echo ""
  echo "HTTP Endpoints & Health Check:"

  # Acuity API (8000)
  if curl -s -f http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
    echo "  [OK] Acuity FastAPI:           http://127.0.0.1:8000 (status=ok)"
  else
    echo "  [DOWN] Acuity FastAPI:         http://127.0.0.1:8000"
  fi

  # Business Extension API (4000)
  if curl -s -f http://127.0.0.1:4000/health >/dev/null 2>&1; then
    echo "  [OK] Business Extension API:   http://127.0.0.1:4000 (status=ok)"
  else
    echo "  [DOWN] Business Extension API: http://127.0.0.1:4000"
  fi

  # Next.js Frontend (3000)
  if curl -s -I http://127.0.0.1:3000 >/dev/null 2>&1; then
    echo "  [OK] Next.js Frontend:         http://127.0.0.1:3000"
  else
    echo "  [DOWN] Next.js Frontend:       http://127.0.0.1:3000"
  fi

  # MinIO Console (9001)
  if curl -s -I http://127.0.0.1:9001 >/dev/null 2>&1; then
    echo "  [OK] MinIO Console:            http://127.0.0.1:9001"
  else
    echo "  [DOWN] MinIO Console:          http://127.0.0.1:9001"
  fi

  echo ""
  echo "Database Backend: Neon PostgreSQL (project: twilight-haze-75311315, db: ai_calling_os)"
  echo "Local PostgreSQL: REMOVED (no container running on port 5432)"
  echo "Legacy Acuity UI Container: REMOVED (no container running on port 3010)"
}

function stop_services() {
  echo "Stopping services..."
  pkill -f "bun run src/server.ts" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  ./local.sh stop
  echo "Services stopped."
}

function run_tests() {
  echo "Running Business Extension API tests..."
  (cd extensions/business-api && bun test)
  echo ""
  echo "Running UI integration tests..."
  (cd ui && npm run test -- business-auth)
}

function start_services() {
  echo "1. Starting Docker support services (Redis, MinIO, Acuity API on Neon)..."
  ./local.sh up -d --wait api redis minio

  echo "2. Ensuring database migrations are up to date..."
  (cd extensions/business-api && bun run migrate)

  echo "3. Starting Business Extension API on port 4000..."
  if ! pgrep -f "bun run src/server.ts" >/dev/null 2>&1; then
    (cd extensions/business-api && nohup bun run src/server.ts >/tmp/business-api.log 2>&1 &)
    sleep 1
  fi

  echo "4. Checking Next.js Frontend on port 3000..."
  if ! lsof -ti :3000 >/dev/null 2>&1; then
    echo "Starting Next.js Frontend dev server..."
    (cd ui && nohup npm run dev >/tmp/nextjs-dev.log 2>&1 &)
    sleep 2
  fi

  echo ""
  status
}

case "$ACTION" in
  start|up)
    start_services
    ;;
  stop|down)
    stop_services
    ;;
  status|ps)
    status
    ;;
  test)
    run_tests
    ;;
  *)
    echo "Usage: $0 [start|stop|status|test]"
    exit 1
    ;;
esac
