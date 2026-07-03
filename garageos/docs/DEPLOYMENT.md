# Deploying GarageOS to production

Phase 12 · Week 1 — Infrastructure. Goal: **someone outside your computer can
use GarageOS**, over HTTPS, with backups.

The whole platform runs as one Docker Compose stack behind Caddy (automatic
Let's Encrypt HTTPS). Only ports 80/443 are exposed; the backend, Postgres, and
Redis stay on the internal Docker network.

```
Internet ─▶ Caddy (:443, auto-HTTPS) ─▶ dashboard (Next.js)
                                            └─▶ backend (FastAPI) ─▶ Postgres / Redis
telegram-bot ──▶ Telegram (long-poll, outbound only — no inbound port needed)
```

## Prerequisites

- A Linux host (2 vCPU / 4 GB RAM is enough to start) with Docker + Docker Compose.
- A domain with an **A record** pointing at the host's public IP (e.g.
  `app.garageos.example`).
- Ports **80** and **443** open (Caddy needs both for the ACME challenge + TLS).
- The Telegram bot token (from BotFather).

## 1. Configure

```bash
git clone <your-repo> /opt/garageos && cd /opt/garageos
cp .env.prod.example .env.prod
# Edit .env.prod — set DOMAIN, ACME_EMAIL, DB password, a strong SECRET_KEY
# (openssl rand -hex 32), the Telegram token, and
# TELEGRAM_MINI_APP_URL=https://<DOMAIN>/mini
```

## 2. Launch

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The backend runs `alembic upgrade head` on start, so the schema is created
automatically. Caddy provisions the TLS certificate on first request (give it
~30s). Check status:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS https://<DOMAIN>/            # dashboard
```

## 3. Seed a demo tenant (optional, for a sales demo)

```bash
docker compose -f docker-compose.prod.yml exec backend python -m app.seeds.demo --fresh
# Login: admin@demo.garageos.app / demo1234
```

For a **real** garage, use the onboarding flow (Phase 12 · Week 4) instead of
the demo seed.

## 4. Wire the Telegram Mini App (finally real)

With a public HTTPS URL, the Mini App can open inside Telegram:

```bash
docker compose -f docker-compose.prod.yml exec telegram-bot python setup_bot.py
```

This sets the bot commands + the **Open Garage** menu button to
`TELEGRAM_MINI_APP_URL`. Open the bot in Telegram → tap **Open Garage** → the
Mini App loads, verifies the customer's Telegram identity, and lands on Home.

> Security: rotate the bot token (BotFather `/revoke`) and set a fresh
> `TELEGRAM_BOT_TOKEN` before a public launch — the dev token has been in a
> local `.env`.

## 5. Backups

```bash
chmod +x scripts/backup.sh
# Add to the host crontab (nightly at 03:00):
#   0 3 * * *  cd /opt/garageos && ./scripts/backup.sh >> /var/log/garageos-backup.log 2>&1
```

Backups land in `./backups` (last 14 days). **Recommended:** sync them off-host
to S3/Cloudflare R2 (see the TODO in `scripts/backup.sh`).

**Prove your backups restore** — a dump you have never restored is a hope, not a
backup. `restore-test.sh` restores the latest backup into a throwaway Postgres
container (never touching production) and asserts the schema and core tables came
back with data:

```bash
chmod +x scripts/restore-test.sh
./scripts/restore-test.sh                     # newest backup in ./backups
# Weekly, after nightly backups:
#   30 3 * * 0  cd /opt/garageos && ./scripts/restore-test.sh >> /var/log/garageos-restore-test.log 2>&1
```

## 6. Security & reliability (M2)

These controls are on by default and configured in `.env.prod`:

- **Rate limiting** (Redis-backed, per client IP). Auth endpoints (login, refresh,
  Telegram sign-in/link) allow `RATE_LIMIT_AUTH_MAX` attempts per
  `RATE_LIMIT_AUTH_WINDOW_SECONDS` — a brute-force ceiling. It **degrades open**:
  if Redis is unavailable, requests are allowed rather than everyone locked out. A
  throttled caller gets `429` with a `Retry-After` header. Because the real client
  sits behind Caddy, `TRUST_PROXY_HEADERS=true` reads the IP from
  `X-Forwarded-For`; keep it `true` only while behind a proxy that sets that header.
- **Audit log** (`audit_logs` table). Append-only trail of security-relevant
  actions — every login, success **and** failure, with IP + user-agent. Written in
  its own transaction so a failed login is still recorded, and best-effort so it can
  never turn a working action into an error. Inspect it with:
  ```bash
  docker compose -f docker-compose.prod.yml exec postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "SELECT created_at, action, status, actor_email, ip FROM audit_logs ORDER BY created_at DESC LIMIT 20;"
  ```
- **Error monitoring (Sentry)** — optional, off unless `SENTRY_DSN` is set. When
  set, unhandled errors are reported with PII scrubbed (`send_default_pii=False`).
  `SENTRY_TRACES_SAMPLE_RATE` (default `0.0`) turns on performance tracing.

## Operate

```bash
# logs
docker compose -f docker-compose.prod.yml logs -f backend dashboard
# update to a new version
git pull && docker compose -f docker-compose.prod.yml up -d --build
# restore a backup
gunzip -c backups/garageos-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
# verify a backup actually restores (throwaway container, non-destructive)
./scripts/restore-test.sh
```

## Still to come in Phase 12

- **Week 2** — CI/CD (GitHub Actions: tsc + tests + Playwright + i18n + build →
  deploy). ✅ Sentry, rate limiting, audit log, and restore testing landed in M2
  (see §6). Still open: uptime/external monitoring.
- **Week 3** — Stripe subscriptions + invoice payment gateway.
- **Week 4** — self-service onboarding + data import.

## Health endpoints

- Backend: `GET /health` (liveness), `GET /ready` (DB + Redis check).
- Compose healthchecks gate startup ordering and let you `docker compose ps`
  the real state.
