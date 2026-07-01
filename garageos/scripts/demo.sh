#!/usr/bin/env bash
#
# One command to a fresh, fully-populated GarageOS demo database.
# Works on Windows/git-bash, Linux, and macOS (auto-detects the venv layout).
#
#   bash scripts/demo.sh          # fresh reset + migrate + seed
#   bash scripts/demo.sh --keep   # keep existing volumes, just migrate + reseed
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # -> garageos/
cd "$ROOT"

# Resolve the venv python across OSes.
if [ -x "backend/.venv/Scripts/python.exe" ]; then
  PY="$ROOT/backend/.venv/Scripts/python.exe"
elif [ -x "backend/.venv/bin/python" ]; then
  PY="$ROOT/backend/.venv/bin/python"
else
  echo "ERROR: no venv found at backend/.venv — create it and install requirements first." >&2
  exit 1
fi

KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

if [ "$KEEP" -eq 0 ]; then
  echo ">> Resetting DB + Redis volumes..."
  docker compose down -v
fi

echo ">> Starting Postgres + Redis (waiting for healthy)..."
docker compose up -d --wait postgres redis

echo ">> Applying migrations..."
( cd backend && "$PY" -m alembic upgrade head )

echo ">> Seeding demo data..."
( cd backend && "$PY" -m app.seeds.demo --fresh )

echo ""
echo ">> GarageOS demo ready."
echo "   Start the API:  ( cd backend && \"$PY\" -m uvicorn app.main:app --reload )"
echo "   Then open:      http://localhost:8000/docs   (and /health, /ready, /version)"
