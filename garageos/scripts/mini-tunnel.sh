#!/usr/bin/env bash
# One command to (re)establish the GarageOS dev stack + public Telegram Mini App
# tunnel. Docker-aware and safe to re-run — this is the whole "make the Mini App
# reachable from Telegram again" chore in a single script.
#
#   1. ensure the Docker stack is up (postgres / redis / backend / dashboard / bot)
#   2. wait for the dashboard to answer on :3000
#   3. (re)start exactly ONE cloudflared quick tunnel -> the dashboard
#   4. write the fresh public URL into .env (TELEGRAM_MINI_APP_URL)
#   5. repoint the bot's "Open Garage" menu button, INSIDE the running bot
#      container (no second bot.py poller — the container is the only getUpdates
#      consumer for the token; a second one would conflict)
#
# Run:  bash garageos/scripts/mini-tunnel.sh
#
# NOTE: trycloudflare quick-tunnel URLs are ephemeral (they change on every
# restart). Re-run this after a reboot / after cloudflared exits. For a URL that
# never changes, put a real domain (or a named Cloudflare Tunnel) in front of the
# dashboard and set TELEGRAM_MINI_APP_URL to it once instead.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # -> garageos/
CF="$ROOT/tools/cloudflared.exe"
ENV_FILE="$ROOT/.env"
PORT=3000
LOG="$ROOT/tools/.cf-tunnel.log"

[ -x "$CF" ] || { echo "✗ cloudflared not found at $CF"; exit 1; }

# Run compose from the repo root with NO explicit -f, so docker-compose.override.yml
# (the machine-local port remaps: postgres 5433, backend 8001) auto-loads. Passing
# `-f docker-compose.yml` would drop the override and hit port conflicts.
cd "$ROOT"

echo "→ Ensuring Docker stack is up…"
docker compose up -d >/dev/null 2>&1 || {
  echo "✗ 'docker compose up -d' failed — is Docker Desktop running?"; exit 1; }

echo "→ Waiting for dashboard on :$PORT…"
ok=""
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/login"; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { echo "✗ dashboard never answered on :$PORT"; exit 1; }

echo "→ (Re)starting cloudflared quick tunnel…"
cmd.exe /c "taskkill /F /IM cloudflared.exe" >/dev/null 2>&1 || true
sleep 1
: > "$LOG"
nohup "$CF" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >"$LOG" 2>&1 &
disown 2>/dev/null || true

URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "✗ tunnel URL not found. Recent log:"; tail -20 "$LOG"; exit 1; }
echo "→ Tunnel: $URL"

MINI="$URL/mini"
if grep -q '^TELEGRAM_MINI_APP_URL=' "$ENV_FILE"; then
  sed -i "s#^TELEGRAM_MINI_APP_URL=.*#TELEGRAM_MINI_APP_URL=$MINI#" "$ENV_FILE"
else
  printf '\nTELEGRAM_MINI_APP_URL=%s\n' "$MINI" >>"$ENV_FILE"
fi
echo "→ .env TELEGRAM_MINI_APP_URL=$MINI"

echo "→ Repointing bot menu button…"
docker compose exec -T -e TELEGRAM_MINI_APP_URL="$MINI" telegram-bot python setup_bot.py

echo ""
echo "✓ Mini App live: $MINI"
echo "  Open @garageos1_bot in Telegram → tap 'Open Garage'."
