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
backend/.venv/Scripts/python -m pip install --upgrade pip==26.2.1         # Windows
backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
# backend/.venv/bin/python -m pip install --upgrade pip==26.2.1          # Linux/macOS
# backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt

# 2. One command: fresh DB + Redis, migrations, and a fully-populated demo
bash scripts/demo.sh          # or:  make demo

# 3. Run the API
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload
```

Use a fresh virtualenv when upgrading from the former python-jose requirement
set: installing new requirements does not uninstall removed dependencies.
`requirements.txt` contains production packages; `requirements-dev.txt` adds the
patched test tooling. Jenkins selects a new private virtualenv for each changed
requirement set and audits every installed distribution with a separate auditor.
The production image has no pytest/pytest-asyncio or auditing tool.

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

## Real garage setup

Use the operator provisioning command for the first real garage and later staff
additions. It prepares reference roles/vehicle models and the requested accounts
without creating demo customers, vehicles, bookings or billing records. Default
mode is a read-only plan; `--apply` creates missing identities in one transaction.

See [the operator guide](../docs/PROVISIONING.md) for Windows/Docker commands,
secret input, validation, safe repeat/add-staff behavior and failure recovery.
The non-secret manifest starts from [provisioning.example.json](provisioning.example.json).

```sh
# backend/; configure the intended DB through the existing environment mechanism
python -m alembic upgrade head
python -m app.commands.provision --config garage.local.json
# Provide GARAGEOS_STAFF_* passwords securely for new accounts, then:
python -m app.commands.provision --config garage.local.json --apply
```

Provisioning requires the bundled migration heads. It has no wipe, password reset,
account transfer, role-change or reactivation mode. Keep the customer manifest
outside Git; `backend/garage.local.json` is ignored. Actual hosting, signed apps
and client acceptance remain delivery work tracked in #10.

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

Default demo credentials (all tenants): password `parol12345`,
admin email `admin@<tenant-slug>.garageos.app` (e.g. `admin@demo.garageos.app`).
When `DEMO_MODE_ENABLED=true`, password logins for the configured demo tenant
receive the same read-only session as the public demo entry point.

## Multi-tenant isolation — important

### Staff access lifecycle and permissions

Staff login, token refresh, authenticated requests and public demo sign-in require
an active user, service center and role. Suspending any of these denies previously
issued tokens on the next request; unavailable identities and malformed token
subjects return `401`, so mobile refresh failures end the session. Suspension is
checked against current database state, not cached in JWT claims. Re-enabling an
identity does not invalidate its otherwise unexpired tokens; this is suspension,
not a permanent logout/revocation registry.

`GET /api/v1/auth/me` exposes effective `permissions`. The current shared staff
API uses this capability policy:

| Active role | Permissions |
| --- | --- |
| `admin`, `manager`, `receptionist`, `super_admin` | `staff.read`, `staff.write` |
| `mechanic` | `work.read.assigned`, `work.write.assigned` |
| Unknown role | None |
| Public demo session | At most `staff.read` |

Every staff tenant Unit of Work enforces the required capability before opening
its transaction. The platform flag does not bypass permissions or tenant scope.
The case-conversation lookup can create a thread on first open; that creation
also requires `staff.write`, even though the route uses GET. Read-only accounts
can read an existing thread, but receive `403` if it would need to be created.
Mechanics use `/api/v1/mechanic/work` to read, start and complete only work
explicitly linked to their account. They cannot inspect tenant-wide customers,
appointments or billing. Completion cannot change financial amounts. Reception
can operate billing; finer financial approvals remain later work. Legacy
mechanic names grant no account ownership; an operator must assign a real
account through the appointment editor. See `../docs/MECHANIC-WORKFLOW.md`.
The customer portal uses a separate principal and dependency chain.

Update the API and Flutter app together: live mobile sign-in requires the
permissions field and fails closed if it is absent. The role catalog is global;
suspending a role affects every garage using it. To suspend one employee, change
that user's `is_active`, not the global role.

Owners can manage their garage's employee accounts through `/api/v1/staff` and
the browser Settings page. Other staff and public demos cannot use this API;
owner/platform identities are protected. See [employee account workflow](../docs/STAFF-ACCOUNTS.md).

Focused real-database regressions:

```sh
python -m pytest tests/test_staff_access_lifecycle.py -q
```

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

### Customer password identities

Run `alembic upgrade head` before deploying the customer password portal.
`customer_accounts` stores the hash and session version, linked to the existing
customer and garage; customer emails are a separate, case-insensitive login
namespace from staff. Owner-only `/customers/{id}/account` GET/POST/PATCH creates
or suspends/restores access. No reset/delete/transfer operation is exposed.
`/customer/auth/login` and `/customer/auth/refresh` issue customer token types;
password tokens additionally bind the active credential/version. `/customer/history`
contains bounded own-customer reads and excludes internal notes/draft invoices.
Existing Telegram identities remain independent. Suspend password access is not
Telegram unlinking; archived customer/inactive garage blocks customer reads.
Migration adds an empty identity table without rewriting customer history.
Downgrade removes password identities; back up before downgrade and never treat
it as a safe rollback that preserves newly created logins.

Owner-created password tokens are restricted server-side to GET customer/me and customer/history reads. Legacy Telegram billing/draft and mutation routes reject these tokens with 403; Telegram tokens retain their existing route policy. Login and credential-checked refresh remain available.

## Superadmin platform reads

`GET /api/v1/platform/records/{kind}` supports centers, staff, customers, vehicles,
appointments, invoices (including estimates/drafts) and payment records. Every
request requires an active identity/garage/role, both `super_admin` role and
`is_super_admin=true`, and a non-demo access token. `/auth/me` advertises a
separate `platform_permissions` list. Legacy admin+flag and role-only identities
are denied. Internal admin registration now uses flag=false; existing rows are
not modified. Customer tokens cannot substitute for staff tokens.

Queries: literal `q` (max100), `page` (fixed30, stable created_at/UUID ordering),
optional `center_id`, inclusive UTC `start`/`end` dates. Lists include archived
records; business projections exclude credentials, private notes and payment
references/idempotency keys. The chosen garage can be suspended. Date filtering
uses appointment_date, invoice issued_at, payment received_at, otherwise creation
of registry records. Clear dates for all-time data. Invalid dates/ranges/pages422.

`GET /platform/stats` uses the same garage/date filters. Counts are active rows,
with centers_total additionally including suspended garages. Financial sums use
issued invoices (excluding estimates/drafts/void/inactive) and active payments
with matching active invoice/garage. Receipts include payments and deposits;
refunds and net receipts are separate. Invoice issue dates and payment receipt
dates are independent, and currency groups are never added together.

`/platform` is the dedicated browser workspace; normal login selects it only
from server-verified platform permissions. It exposes reads, searches and filters.
Tenant endpoints retain their original center/role policy, with no global bypass.
Deep vehicle health/inbox/audit drill-down and exports remain later explicit work.
There is no HTTP platform enrollment or global write API. Real platform enrollment
uses the separate trusted-operator CLI described in
[PLATFORM-ACCOUNTS.md](../docs/PLATFORM-ACCOUNTS.md):
`python -m app.commands.enroll_platform --config platform.local.json` plans;
`--apply` creates only a new fixed role+flag identity or keeps an exact existing
match. It requires an explicit active anchoring garage/current role catalog and
reports both global reads and the role's existing tenant staff capabilities.
Production enrollment is performed privately by its authorized operator;
ordinary staff provisioning cannot elevate roles/flags. See ADR0006.
