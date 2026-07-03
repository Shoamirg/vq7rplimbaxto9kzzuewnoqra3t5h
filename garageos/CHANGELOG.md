# Changelog

All notable milestones for GarageOS. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are ISO-8601.

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
