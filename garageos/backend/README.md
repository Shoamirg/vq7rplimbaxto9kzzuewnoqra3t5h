# GarageOS Backend

Async FastAPI backend for the GarageOS multi-tenant garage management platform.

- **Stack:** FastAPI · SQLAlchemy 2 (async) · asyncpg · Alembic · Pydantic 2 · Redis
- **Python:** 3.11+
- **Multi-tenancy:** every business table carries `service_center_id`; queries are
  scoped per tenant (see the isolation notes below).

## Quick start

From the repo's `garageos/` directory:

```bash
# 1. Create the backend virtualenv and install deps
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt   # Windows
# backend/.venv/bin/python -m pip install -r backend/requirements.txt     # Linux/macOS

# 2. One command: fresh DB + Redis, migrations, and a fully-populated demo
bash scripts/demo.sh          # or:  make demo

# 3. Run the API
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload
```

Then open http://localhost:8000/docs. System probes:

| Endpoint   | Purpose                                    |
|------------|--------------------------------------------|
| `/health`  | Liveness (no I/O)                          |
| `/ready`   | Readiness — checks Postgres + Redis (503 until both up) |
| `/version` | Build / runtime metadata                   |

## Common tasks

Via `make` (Linux/CI/mac) or `bash scripts/demo.sh` on Windows/git-bash:

```bash
make up          # start Postgres + Redis (waits for healthy)
make migrate     # alembic upgrade head
make seed        # seed demo data (idempotent)
make seed-fresh  # wipe tenant data and reseed
make demo        # reset + migrate + seed-fresh (one clean, populated instance)
make verify      # verify multi-tenant data isolation
make dev         # run the API with autoreload
make down        # stop services
```

## Database migrations

### Active identity uniqueness (2026-10-04)

PostgreSQL enforces one active customer per normalized nonempty phone and one
active vehicle per normalized nonempty plate/VIN **within each garage**. Phone
formatting is ignored; vehicle identifiers ignore whitespace/hyphens and case.
Archived records, missing identifiers and the same identity in another garage
remain supported. The staff API returns its existing `409` duplicate response
even when the database catches a competing write after the application check.

Migration `b3c4d5e6f7a8` locks the affected tables while checking/creating indexes.
If existing active duplicates are present, it stops with the index name and group
count. It does not merge, delete or archive records, and its transaction rolls
back. Take a backup, review conflicting records with the garage, resolve their
ownership/history deliberately, and retry. Schedule this migration when the
garage can pause writes. Never reseed a client database to make migration pass.

`alembic check` must pass after upgrades (also enforced by CI). Notification,
operational-case and audit model defaults now match the already deployed schema;
their existing primary-key indexes avoid redundant secondary ID indexes.

Migration `e1bdd605818c` creates the four inbox tables on fresh installs and
adopts matching tables that older demo seeds created. Existing threads, messages,
participants and attachments are preserved. Its downgrade intentionally retains
inbox tables/data because the preceding application already uses them; a later
upgrade adopts them again. No demo seed is required for a complete schema.

```bash
cd backend
.venv/Scripts/python -m alembic upgrade head          # apply
.venv/Scripts/python -m alembic downgrade -1          # roll back one
.venv/Scripts/python -m alembic revision --autogenerate -m "message"  # new migration
```

The Alembic env is async and reads the model metadata + `DATABASE_URL` from the app
config, so there is a single source of truth. Migrations live in `backend/alembic/versions/`.

## Seeding

The seed framework lives in `backend/app/seeds/` and is data-driven from
`backend/data/*.json` (brands, models, maintenance rules). Datasets are modular and
reproducible (fixed RNG seed). It creates two tenants — a large demo workshop and a
small second tenant used for isolation testing.

```bash
cd backend
.venv/Scripts/python -m app.seeds.demo           # idempotent
.venv/Scripts/python -m app.seeds.demo --fresh   # wipe tenant data, reseed
```

Seeded volumes (primary tenant): 7 users, 200 customers, 350 vehicles, 40 appointments,
150 service records, 132 maintenance rules.

Default demo credentials (all tenants): password `demo1234`,
admin email `admin@<tenant-slug>.garageos.app` (e.g. `admin@demo.garageos.app`).

## Multi-tenant isolation — important

Isolation is **caller-enforced**, not automatic:

- `BaseRepository.list(service_center_id=...)` and `count(...)` scope correctly **when
  the tenant id is passed**.
- `BaseRepository.get_by_id(id)` is **NOT** tenant-scoped — it fetches by id alone. The
  service/API layer **must** verify the returned row's `service_center_id` against the
  authenticated user's tenant, or it is an IDOR vulnerability.

Run `make verify` (or `python -m scripts.verify_tenant_isolation`) to check data
partitioning, cross-tenant FK integrity, and the repository filter behavior.

## Local environment notes

- `ENVIRONMENT` accepts `development`, `test`, `staging`, and `production`.
  Staging/production require `DEBUG=false`, a generated JWT secret of at least
  32 bytes, and explicit HTTPS CORS origins without paths, credentials or
  wildcards. Invalid settings stop startup; validation output hides input values.
  This rejects common defaults/placeholders; it does not measure secret entropy.
- To run destructive **isolated migration tests**, use `ENVIRONMENT=test` and a
  loopback database named `garage_test`, with a test role allowed to create/drop
  databases. The tests create uniquely named disposable databases and only remove
  those databases. Other environments skip those migration tests.

- Config is read from `garageos/.env` (see `.env.example`). It is resolved by absolute
  path, so host tooling works regardless of the current directory.
- On this machine, host port 5432 is already used by another project, so
  `docker-compose.override.yml` (gitignored) maps Postgres to **5433** and `.env` points
  there. Clean machines use the committed default (5432).
- Use `127.0.0.1` rather than `localhost` in `DATABASE_URL`/`REDIS_URL` on Windows — the
  IPv6 `::1` resolution path causes slow/failed connects with connect-timeouts.
