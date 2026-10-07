# Deploying GarageOS to production

Phase 12 · Week 1 — Infrastructure. Goal: **someone outside your computer can
use GarageOS**, over HTTPS, with backups.

The whole platform runs as one Docker Compose stack behind Caddy (automatic
Let's Encrypt HTTPS). Only ports 80/443 are exposed. Caddy proxies `/api/v1` and
`/api/v1/*` to FastAPI for native clients; all other paths go to the dashboard,
including its `/api/auth/*` and `/api/proxy/*` BFF. The backend has no published
port; Postgres and Redis stay on the internal Docker network.

```
Internet ─▶ Caddy (:443, auto-HTTPS) ─┬─▶ /api/v1/* ─▶ backend (FastAPI)
                                    └─▶ dashboard (Next.js) ─▶ backend
                                                              └─▶ Postgres / Redis
telegram-bot ──▶ Telegram (long-poll, outbound only — no inbound port needed)
```

## Prerequisites

Client handover is tracked in [issue #10](https://github.com/Shoamirg/garageos/issues/10).
Passing local/CI tests does not prove that a client host, production accounts,
off-host scheduled backups, signed mobile releases or physical-device pilot are
ready. Verify those against the actual target environment before handover.
The current staff API/Flutter permissions contract is documented in
`backend/README.md` and `flutter_app/README.md`; update both together. Do not use
seeded demo passwords or reset the client's database with `--fresh`.

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

The backend refuses to start in staging/production with `DEBUG=true`, a short or
common placeholder `SECRET_KEY`, or CORS origins that are not explicit HTTPS
origins. Use `https://your-domain` without a trailing slash, path, wildcard or
credentials. Validation messages hide supplied values. Keep the actual secrets
out of Git. `DEMO_MODE_ENABLED=false` is the client deployment default; enable the
read-only public demo only intentionally on a deployment with demo accounts.

## 2. Launch

The dashboard's Docker build uses the `garageos/` workspace root. Its
`.dockerignore` permits the root npm manifests, dashboard and shared packages;
local `.env` files, credentials (`*.pem`, `*.key`), installed dependencies and
generated Next/Playwright output are excluded. Backend, Flutter and backup files
are also outside that context. Backend images use their own `backend/` context
and `.dockerignore`. Pass actual deployment values at runtime through `.env.prod`.
Keep private files outside source directories, even when they have other names.

Verify context filtering independently with synthetic files, then build the
production application images from `garageos/`:

```bash
python scripts/test_dashboard_build_context.py
docker build -f docker/Dockerfile.backend.prod -t garageos-backend:local backend
docker build -f docker/Dockerfile.dashboard.prod -t garageos-dashboard:local .
```

Context filtering does not prove dependency security, application startup or
successful deployment. The production build itself checks the standalone bundle,
TypeScript and lint. Verify startup, schema/readiness and authenticated routes on
the target stack before client handover.

Install JavaScript dependencies from the `garageos/` workspace root using
`npm ci`. The root manifest overrides Next's pinned PostCSS with `8.5.29` to
include the [source-map security fix](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp).
Retain that override until Next supplies a patched PostCSS version itself, then
remove it only after checking the installed tree, audit and production build.
Use npm 10, matching the production Docker build, to verify that
`npm ls postcss --all` shows the patched version under Next and the application.
On the same installed workspace, npm 11.11.0 reports a conflicting `8.4.31`
requirement despite the override; `npx --yes npm@10.8.2 ls postcss --all` verifies
the installed tree without that diagnostic.

The web CSS toolchain uses Tailwind4.3.3 and its dedicated PostCSS plugin, with
tailwind-merge3.7.0 shared by the dashboard/design system. All web routes require
Safari16.4+, Chrome111+ or Firefox128+ per the
[Tailwind browser requirements](https://tailwindcss.com/docs/upgrade-guide).
Native Flutter requirements are separate. Tokens, legacy outline variants,
animations and print rules are retained; Inter/Manrope are served by Next's local
font assets, without a browser request to Google Fonts.

A version-scoped override replaces only Next15.5.27 lint's `fast-glob` dependency
with `tinyglobby0.2.17`. The installed implementation is tinyglobby, using its
compatible `globSync(pattern, {onlyDirectories:true})` API for Next root discovery;
the fast-glob/micromatch/braces implementation chain is removed. Next lint rules
and framework versions are retained. `npm run check:next-root-glob` exercises the
actual installed internal-link rule against monorepo/brace/Windows paths and valid
link controls. Reevaluate this override/test when upgrading the Next lint plugin.
Use `npx --yes npm@10.8.2 ls fast-glob --all` for tree verification; npm11 also
reports the alias against the original pinned requirement as invalid, even when
fresh `npm ci` and both unsuppressed audits succeed.

Jenkins records full and production-only `npm audit --json` results and rejects
new alerts. An audit is a known-advisory check, not a proof of all code's security.
The production image uses Node22 LTS/npm10; Node20 has reached end of life. See the
[Node support schedule](https://nodejs.org/en/about/previous-releases).

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The backend runs `alembic upgrade head` on start, so the schema is created
automatically. Caddy provisions the TLS certificate on first request (give it
~30s). Check status:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -fsS https://<DOMAIN>/            # dashboard
curl -i https://<DOMAIN>/api/v1/auth/me # must be backend JSON 401 without a token
```

The unauthenticated `401` confirms public routing and rejection, not successful
login. In the Flutter API URL setting use **`https://<DOMAIN>/api/v1`**. Keep the
version prefix; do not use the Docker hostname `backend`, `localhost` or the
Android emulator alias `10.0.2.2` on a remote physical phone. Test staff/customer
login with provisioned accounts and authorized history on the real phone before
handover. API credentials are entered in the app; keep them out of commands/logs.
Backend `/health`, `/ready`, `/docs` and `/openapi.json` are not exposed by the
API matcher; use internal checks for backend readiness.

The proxy keeps the URI, request body and Authorization header intact, using
[Caddy handle](https://caddyserver.com/docs/caddyfile/directives/handle) and
[reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
Run the isolated routing regression before deployment (Docker Linux containers
and Python 3.12 required):

```bash
python scripts/test_public_routing.py
```

This runs the actual production Caddyfile with temporary HTTP transport fixtures
and removes its own containers/network. It checks routing, request preservation,
upstream `401`, security headers and forwarded-header spoofing. It also validates
the HTTPS configuration; it does not obtain a certificate or prove real backend
authentication, server reachability or physical-device acceptance. Existing
backend/Flutter authentication tests remain separate gates.

Before updating an existing database, take and restore-test a backup. Migration
`b3c4d5e6f7a8` enforces per-garage active phone/plate/VIN uniqueness. It stops on
existing duplicates with a group count, leaves records untouched, and rolls back
all index changes. Resolve the records with the garage before retrying; do not
delete its data or run `--fresh`. This migration locks customers/vehicles during
checks/index creation, so schedule a pause in writes for the update.

Migration `e1bdd605818c` also creates the inbox schema without demo seeding and
adopts existing seed-created tables. Inbox tables and message data remain on its
downgrade to support the earlier application; re-upgrade preserves them. Do not
drop those tables as a release rollback step.

## 3. Seed a demo tenant (optional, for a sales demo)

```bash
docker compose -f docker-compose.prod.yml exec backend python -m app.seeds.demo --fresh
# Login: admin@demo.garageos.app / demo1234
```

For a **real** garage, use the implemented operator provisioning command in
[PROVISIONING.md](PROVISIONING.md). It creates the garage, reference catalog and
requested staff without demo transactions. Review the default read-only plan,
provide passwords through the named environment variables and then use `--apply`.
Run migrations first. Keep public demo disabled and never run the demo `--fresh`
command against a client's database. Self-service onboarding is still separate work.

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

The backup script uses private file permissions, writes to a hidden temporary
file, verifies a nonempty gzip dump, and then publishes it by a same-directory
rename. Completed names are `garageos-YYYYMMDD-HHMMSS-<suffix>.sql.gz`; older names
remain restorable. Failed/empty dumps leave no completed-looking archive and do
not prune existing backups. `RETENTION_DAYS` must be a positive integer. Pruning
only touches matching files directly inside `BACKUP_DIR`. Environment and backup
paths may contain spaces. Keep that directory on a filesystem supporting atomic
rename, restrict access, and monitor the command's exit status.

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

The restore test reads `POSTGRES_USER` from `.env.prod` so the throwaway
database has the same role as the plain SQL dump. For a local dump without
`.env.prod`, set `POSTGRES_USER` when running the test. `ENV_FILE` can point to
a different environment file.

Corrupted gzip archives are rejected before a container is started. A passing
restore test proves the checked schema/data can be restored; it does not prove
off-host copies, retention scheduling, storage capacity or client acceptance.
The test removes its own container and anonymous database volume on exit.

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
