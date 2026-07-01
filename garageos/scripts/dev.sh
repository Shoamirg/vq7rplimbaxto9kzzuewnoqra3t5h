#!/usr/bin/env bash
#
# One command to run GarageOS locally (DB + backend + frontend).
#   bash scripts/dev.sh                    # backend :8000, frontend :3000
#   BACKEND_PORT=8001 bash scripts/dev.sh  # if :8000 is taken by another project
#
# Then open http://localhost:3000 and sign in:
#   admin@demo.garageos.app / demo1234
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -x "$ROOT/backend/.venv/Scripts/python.exe" ]; then
  PY="$ROOT/backend/.venv/Scripts/python.exe"
else
  PY="$ROOT/backend/.venv/bin/python"
fi

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
# 127.0.0.1 (not localhost) so Node's server-side fetch doesn't hit IPv6 ::1.
export NEXT_PUBLIC_API_URL="http://127.0.0.1:${BACKEND_PORT}/api/v1"

echo ">> Ensuring Postgres + Redis are up..."
( cd "$ROOT" && docker compose up -d --wait postgres redis )

echo ">> Backend  -> http://127.0.0.1:${BACKEND_PORT}"
( cd "$ROOT/backend" && "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" ) &
BE=$!
echo ">> Frontend -> http://localhost:${FRONTEND_PORT}"
( cd "$ROOT/admin-dashboard" && npx next dev -p "$FRONTEND_PORT" ) &
FE=$!

trap 'kill $BE $FE 2>/dev/null || true' INT TERM EXIT

echo ""
echo ">> Open  http://localhost:${FRONTEND_PORT}   (admin@demo.garageos.app / demo1234)"
echo ">> Ctrl+C to stop both."
wait
