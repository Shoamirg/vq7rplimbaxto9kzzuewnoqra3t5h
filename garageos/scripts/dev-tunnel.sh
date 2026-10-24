#!/usr/bin/env bash
# Bring up the public Telegram tunnel and (re)wire the bot to it — one command.
#
# The cloudflared quick-tunnel URL is EPHEMERAL: it changes every time the
# tunnel restarts. This script gets the fresh URL, writes it into garageos/.env,
# repoints the bot's "Open Garage" menu button at it, and runs the long-poller.
# Ctrl+C stops the poller and tears the tunnel down.
#
# Prereqs: backend on :8010 and web on :3000 already running.
#   Backend:  cd garageos/backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8010
#   Web:      cd garageos/admin-dashboard && npm run start -- --port 3000
#
# Run (from git-bash):  bash garageos/scripts/dev-tunnel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # -> garageos/
CF="$ROOT/tools/cloudflared.exe"
PY="$ROOT/backend/.venv/Scripts/python.exe"
ENV_FILE="$ROOT/.env"

[ -x "$CF" ] || { echo "cloudflared not found at $CF"; exit 1; }

echo "→ Starting cloudflared tunnel to http://127.0.0.1:3000 ..."
LOG="$(mktemp)"
"$CF" tunnel --url http://127.0.0.1:3000 --no-autoupdate >"$LOG" 2>&1 &
CF_PID=$!
trap 'kill $CF_PID 2>/dev/null || true' EXIT

URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "Tunnel URL not found. Log:"; cat "$LOG"; exit 1; }
echo "→ Tunnel: $URL"

MINI="$URL/mini"
if grep -q '^TELEGRAM_MINI_APP_URL=' "$ENV_FILE"; then
  sed -i "s#^TELEGRAM_MINI_APP_URL=.*#TELEGRAM_MINI_APP_URL=$MINI#" "$ENV_FILE"
else
  printf '\nTELEGRAM_MINI_APP_URL=%s\n' "$MINI" >>"$ENV_FILE"
fi
echo "→ Wrote TELEGRAM_MINI_APP_URL=$MINI to .env"

PYTHONIOENCODING=utf-8 "$PY" "$ROOT/telegram-bot/setup_bot.py"
echo "→ Bot configured. Starting long-poller (Ctrl+C to stop everything)..."
PYTHONIOENCODING=utf-8 "$PY" "$ROOT/telegram-bot/bot.py"
