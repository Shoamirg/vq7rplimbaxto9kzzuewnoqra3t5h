# Changelog

All notable milestones for GarageOS. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are ISO-8601.

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
