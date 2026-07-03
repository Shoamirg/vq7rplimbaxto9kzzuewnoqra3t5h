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

## Operate

```bash
# logs
docker compose -f docker-compose.prod.yml logs -f backend dashboard
# update to a new version
git pull && docker compose -f docker-compose.prod.yml up -d --build
# restore a backup
gunzip -c backups/garageos-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## Still to come in Phase 12

- **Week 2** — CI/CD (GitHub Actions: tsc + tests + Playwright + i18n + build →
  deploy), Sentry, uptime monitoring.
- **Week 3** — Stripe subscriptions + invoice payment gateway.
- **Week 4** — self-service onboarding + data import.

## Health endpoints

- Backend: `GET /health` (liveness), `GET /ready` (DB + Redis check).
- Compose healthchecks gate startup ordering and let you `docker compose ps`
  the real state.
