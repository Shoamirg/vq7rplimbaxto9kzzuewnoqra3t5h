# Changelog

All notable milestones for GarageOS. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are ISO-8601.

## [Unreleased] — First-client candidate — 2026-10-08

The `codex/service-work-demo` / PR5 candidate is tracked in
[delivery issue10](https://github.com/Shoamirg/garageos/issues/10). This entry is
not a release tag, deployment or real garage acceptance.

### Added

- Flutter staff/mechanic workflows and a separate password-customer portal,
  UZ/EN/RU; owner browser management of employee and customer access.
- Real mechanic-account assignment, active work across dates, completed work
  awaiting an invoice, server search/pagination and safe manual-payment retries.
- Explicit GET-only superadmin registry/statistics and a separate trusted
  operator enrollment CLI with immutable reapply/conflict refusal.
- Local Windows Jenkins, Android signing/packaging preparation and native
  emulator evidence; production database recovery and invoice-volume rehearsals.
- Source-grounded Uzbek usage and private operator handoff guides.

### Fixed

- Staff calendar Day/Week/Month load actual tenant ranges and preserve account
  assignments when moving or resizing visits. Same-name UUID lanes, legacy and
  off-grid records, cancelled opt-in, real booking/contacts and trapped localized
  details replace incomplete controls; stale responses cannot replace a newer
  period. Notification backgrounds/dismiss controls remain readable and localized.
  See [calendar workflow](docs/calendar-workflow.md) for invariants and test seams.

- Invoice/estimate staff and public print views use the actual owning garage's
  current branding/business contacts instead of a fixed demo identity; optional
  contacts stay absent and standalone EN/RU/UZ numbers/dates use shared formatters.
  See [document issuer](docs/document-issuer.md) for public UUID and current-profile limits.

- Staff notification filters/counts/relative timestamps and contextual error and
  loading messages now follow EN/RU/UZ. Named loading statuses and the phone
  notification menu are verified; the localization audit reports the remaining
  backlog accurately in both modes. This completes seven feedback files; other
  staff screens still require localization.
- Selected browser accessibility release gate: allow Mini zoom and readable
  labels/SOS gradients; enlarge staff controls, exclude closed phone navigation
  from keyboard focus, restore the customer-dialog opener and respect reduced
  motion. Toast/notification names follow EN/RU/UZ, and branded button text uses
  a readable foreground. Unsuppressed scans and actual keyboard/44px/motion
  regressions retain the existing functional suite; client-device acceptance
  remains separate.
- Tenant/account lifecycle, duplicate identity and financial consistency;
  invoice-history query growth and vulnerable dashboard/backend dependencies.
- Browser release gate coverage: execute every configured spec instead of the
  selected account/platform subset. Production Mini App tests use private
  synthetic signed launch data; conflict selectors use mechanic UUIDs and mobile
  geometry checks wait for the actual opening animation to finish.

### Delivery limits

Actual client HTTPS/accounts and operator enrollment, scheduled off-host backup
and target recovery/rollback, owner Android/Apple distribution and physical
devices, agreed workload/network checks and daily pilot/support acceptance remain
required. Global health/inbox/audit drilldowns and exports are outside the current
platform registry slice. Historical milestones below keep their original scope;
current evidence and limits belong to issue10.

## [1.0.0-core] — 2026-07-05 — Complete operational platform

Every daily garage workflow now works end to end: a customer books, an advisor
manages, a mechanic works, an invoice is generated and paid, and reports, the
passport, and the digital twin all stay in sync — one event stream throughout.
This closes the stabilization sprint; the create/edit/delete "dead stubs" are gone.

### Added
- **Appointments** — real create (Calendar, Appointments, sidebar, Vehicle,
  Customer 360), edit/reschedule, and delete. Direct date/time booking (no slot
  juggling) that emits `AppointmentCreated`.
- **Billing** — create estimate/invoice, **edit** line items (one modal, two
  modes), **delete** (paid docs protected), **PDF** (print-clean, with pay-QR),
  and **Send/Share** — a public `/invoice/[id]` link, email, and Send-to-Telegram.
- **Telegram booking** — a guided Mini App flow (vehicle → service → day → time →
  review → confirm) that lands straight in the shop's calendar via the same
  `AppointmentService` the staff use.
- **CRUD everywhere** — delete for customers and vehicles (tenant-scoped soft
  delete) with confirmation dialogs.

### Fixed
- Line-item totals: created invoices were computing **$0** (a `.get(default)` that
  never fired because the API always sent `line_total: None`). Now correct.

### Notes
- Release gate: backend 72 tests, tsc, lint, i18n (196 keys), production build,
  Playwright e2e 10/10 — all green.
- Public invoice header shows a generic garage identity (branding not yet in the
  public payload) — a v1.1 follow-up.

## [0.12.0-quality] — 2026-07-03 — Quality, brand & production hardening

The "polish → production" milestone. No new business modules — the platform is
made presentable, localized, observable, and safe to expose to the first pilots.

### Added
- **Vehicle Intelligence Center (Digital Twin)** — the signature composed screen:
  one intelligence payload over health / passport / commercial / predictions /
  timeline, a cinematic hero with clickable subsystem hotspots.
- **Brand system** — logo / mark / app tile, favicon + PWA icon set, Manrope +
  Inter (latin **and** cyrillic, so RU/UZ render), brand tokens + motion.
- **Localization** — `/mini` and the staff dashboard in EN/RU/UZ via a
  dependency-free i18n core (interpolation, plurals, locale-aware `fmt`), guarded
  by a CI coverage check (`npm run i18n:check`, 194 keys).
- **Production infrastructure** — prod Docker stack behind Caddy (auto-HTTPS),
  nightly backups + a restore-test that proves a backup restores, `DEPLOYMENT.md`.
- **CI/CD** — GitHub Actions (backend tests; frontend tsc / i18n / lint / build),
  `/healthz`, a demo-seed step, and an ESLint config so `next lint` actually runs.
- **Reliability (Phase 13)** — Playwright e2e journey suite (staff + customer +
  i18n, host-agnostic) and a `RELEASE_CHECKLIST`.
- **Security (M2)** — Redis rate limiting on auth + roadside (degrades open,
  proxy-aware IP, atomic window); an append-only **audit log** of logins and token
  refreshes; env-gated **Sentry**; restore testing. Hardened after a security
  review (XFF spoofing, connection churn, atomicity, unbounded refresh).

### Notes
- Regression gate for the tag: backend 62 tests, tsc, i18n, lint, Playwright e2e
  10/10, production build — all green.
- Still requires a live host to complete M2 (uptime monitoring, real Sentry DSN)
  and to open the Telegram Mini App over public HTTPS.

## [0.11.0-telegram] — 2026-07-03 — Telegram Mini App

The first customer-facing surface. A dedicated, strict customer API composes the
whole platform; a mobile-first Mini App renders it inside Telegram.

### Added
- **Customer API** (`/api/v1/customer/*`) — isolated from the staff API with its
  own principal, deps, and narrow customer DTOs. Telegram `initData` verified via
  HMAC-SHA256 (`WebAppData`); customer-scoped JWTs (a staff token can't satisfy a
  customer route and vice-versa). Phone linking + refresh + a DEBUG dev sign-in.
- **`CustomerPortalService`** — every read/write bound to the authenticated
  customer via an ownership guard; composes existing services (Passport, Health,
  Billing, UCP Conversations, Operational Cases) rather than duplicating them.
- **`/mini` route group** — mobile-first client with its own customer-scoped BFF
  (httpBearer cookie) and a Telegram-native shell. Screens: Home (action-first),
  Vehicle (Certified Passport), Billing (one action, no payer scoring), Messages
  (UCP, internal notes excluded), Roadside (request → live tracking), Me.
- **Telegram bot** (`telegram-bot/`, `@garageos1_bot`) — the doorway: `/start`
  ships the **Open Garage** Web App launch button; `setup_bot.py` wires commands +
  menu button. Launch activates once `TELEGRAM_MINI_APP_URL` is public HTTPS.
- **Customer estimate approval** — Approve / Decline / Ask on an estimate;
  approve → `EstimateApproved`, decline → `EstimateRejected`, both ring the
  advisor's bell + hit the financial timeline. Ask opens a linked conversation.
- **Roadside attachments** — Location / Photo / Voice become Conversation
  attachments → timeline events → Operations context (same path as the Inbox).

### Notes
- Roadside opens an `OperationalCase` that rides the existing event stream into
  the Operations Center — no special-case Telegram logic.
- Follow-ups: real bot launch needs a public HTTPS Mini App URL; online payment
  and binary photo/voice storage are stubbed; `/mini` bodies not yet i18n'd.

## [0.10.0-reports] — 2026-07-03 — Reports & Analytics

A decision center over the ledger + operational data.

### Added
- **Analytics projection layer** (`services/analytics.py`) — `BaseProjection`
  with a generic report contract (groups / sections / insights / questions /
  reconciliation); one frontend renders all reports.
- **Executive Overview** and **Commercial** reports, projecting over
  `LedgerEntry` (revenue/cash with prev-period deltas), invoices (AR aging,
  conversion funnel), cases, appointments, and health/commercial-health
  distributions. Hand-built SVG charts (no charting dependency).
- **Commercial Integrity** reconciliation — verifies the ledger identity
  (debit − credit = outstanding) and invoice/payment ↔ ledger counts.
- **Seed realism** — ~12mo backdated paid-invoice history + payer profiles +
  cohort spread so trends and distributions are believable.

## [0.9.0-commercial-operations] — 2026-07-03 — Commercial Operations

One commercial model for the whole billing lifecycle, linked to the rest of the
platform.

### Added
- **Invoices & Payments** — one `Invoice` aggregate (`kind` estimate|invoice +
  status lifecycle); estimates and invoices are separate rows linked by
  `source_estimate_id` (immutable estimates). `InvoiceLineItem` (part/labor/fee/
  discount, taxable) and first-class `Payment` (method + kind + **source**).
- **Billing workspace** (`/billing`) — 3-pane rail + document queue + premium
  document, with **distinct estimate (blue) / invoice (green)** identities,
  grouped line items, VAT totals, payments, QR, and a financial timeline.
- **Appointments ↔ Billing** — Health + Billing on every appointment row
  (Paid / balance / Overdue / Est).
- **Customer 360 Financial** — a Financial tab + header KPIs (Lifetime Value /
  Outstanding / Invoices / Avg Days to Pay).
- **Commercial Health** — an operational payer score (score/stars/band/risk),
  the financial equivalent of Vehicle Health, reused across surfaces.
- **`LedgerEntry`** — a reserved append-only money-movement stream; one entry
  per financial mutation (invariant-tested) so Reports/exports project over it.
- **Health Score column** on the Appointments queue.

### Notes
- Backend events (Estimate*/Invoice*/Payment*) feed the financial timeline via
  the existing notification engine — no new timeline table.

## [0.8.0-ucp] — 2026-07-02 — Unified Communications Platform

The integration checkpoint: one universal conversation model across the product.

### Added
- **Unified Communications Platform** — one `Conversation` / `Message` /
  `Participant` / `Attachment` model. Channel is metadata; linked entities
  (customer, vehicle, appointment, case, invoice); mentions, pins, presence;
  split unread (messages vs activity); `last_activity_at` sort; regenerable
  AI summary.
- **Unified Inbox** (`/inbox`) — keyboard-first workspace (`j/k/r/i/f/[ ]`),
  work-queue rail, "why is this open?" status line + AI chip, Activity|Messages
  thread, collapsible context with distinct Assigned/Following/Participants,
  Copilot, Reply/Note/Announcement composer. **Follow** (watchers).
- **Operations ↔ Inbox integration** — Operations renders the live case
  conversation; reciprocal deep-links (*Open in Inbox* / *Open case*) prove the
  shared model.
- **Event → notification bridge** for messages/mentions (one producer, many views).
- **Localization** (English / Русский / Oʻzbek) — dependency-free i18n + top-bar
  switcher; shell translated.
- **Appointments operational queue** — KPI strip, status + date quick-filters
  (`date_from`/`date_to`/`overdue`), plate/duration columns, per-row launchpad
  into every module, bulk actions.
- Sidebar reorganized into labelled sections; Inventory/Reports/Settings/Help pages.
- `docs/demo-flow.md` — scripted walkthrough + release regression checklist.

### Changed
- Appointments moved from a mock calendar grid to a real-data management list
  (Calendar owns scheduling; Appointments owns management).

### Fixed
- Overlapping appointment cards (mock grid) — replaced entirely.
- Inbox deep-link was overridden by the queue auto-select.

---

## Earlier milestones

- **Operations Center** — generalized `OperationalCase` model; live dispatch
  console (severity rail, SLA timers, lifecycle stepper, map, dispatch board).
- **Event Timeline** — the shared event stream projected onto entity timelines.
- **Notification Engine + Center** — event → engine → bell, severity + categories.
- **Global Search (⌘K)** — Raycast/Linear-style palette over customers, vehicles,
  plate, VIN, mechanic + quick actions.
- **Customer 360** — command center per customer (overview, vehicles, passports,
  timeline, appointments, VIP tier, LTV).
- **White-label Branding** — per-tenant logo/colors/name across all surfaces
  (proven: Garage A blue / Garage B orange on one backend).
- **Certified Vehicle Passport 2.0** — premium digital ownership record (live
  data, real QR, public verification, print, garage branding).
- **Vehicle Health** — animated health gauge, component breakdown, due-services.
- **Product Quality Sprint** — handcrafted skeletons, `/showcase`, empty & error
  states.
- **Demo Mode** — curated best-state seed data.
- **Calendar / Scheduling** — slot generation, drag-to-move, mechanic capacity.
- **Dashboard** — executive overview on live data.
- **Foundations** — FastAPI + async SQLAlchemy multi-tenant backend; Next.js 15
  App Router BFF; domain events + Unit of Work; Playwright visual QA.

[0.8.0-ucp]: #080-ucp--2026-07-02--unified-communications-platform
