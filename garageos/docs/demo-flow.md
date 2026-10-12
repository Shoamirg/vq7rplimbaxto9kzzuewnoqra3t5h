# GarageOS — Demo & Regression Flow

A scripted ~12-minute end-to-end walkthrough and regression checklist for the
listed flows. Deployment and real-workshop pilot readiness require the separate
release checklist.

Last verified: 2026-07-03 (Commercial Operations, merge `95b6b9b`, tag `v0.9.0-commercial-operations`).

---

## Local Uzbek service-work flow (verified 2026-09-28)

With the local API and dashboard running, sign in as `admin@demo.garageos.app`
using the demo password above and select Oʻzbek in the language menu.

1. Click **Yangi qabul**. Choose a demo customer, one of their vehicles, a date,
   and a mechanic. Save the appointment.
2. Open **Qabullar**. Use the date filters or search for the customer, plate,
   vehicle model, or service. Search covers all pages of matching appointments.
3. From the row's **Amallar** menu, choose **Tasdiqlash**, then **Ishni boshlash**.
   A mechanic must be assigned before work can start.
4. Choose **Ishni tugatish** and record the performed service. It appears in the
   vehicle's service history.
5. Choose **Hisob yaratish / ochish**. Add UZS prices for labor and parts, then
   save. The public invoice opens with customer, vehicle, line items, total, and
   **Chop etish / PDF saqlash**. Repeating the action opens the same invoice.

The queue's billing column shows a document only when it belongs to that exact
appointment. An invoice from an earlier visit by the same vehicle does not count.
This focused flow is separate from the broader regression checklist below.

## Daily reception and financial safety (2026-10-02)

The local demo now also supports a first-time visitor:

1. In **Yangi navbat**, choose **Yangi mijoz**, enter name and phone, then save.
   Choose **Avtomobil qo‘shish**, select a model, enter plate or VIN and mileage.
   Both records remain selected in the original appointment.
2. Customer/vehicle lists and appointment/invoice pickers search the server.
   Customers beyond the first 50/200 records remain findable. A failed load shows
   an error and retry action rather than an empty result.
3. Booking, moving, resizing and assigning reject overlapping intervals for the
   same mechanic. Adjacent intervals and different mechanics are allowed.
   Available-slot and calendar displays respect direct bookings too.
4. Record a positive payment no greater than the remaining balance. A failed
   response leaves the form open. Retrying the same request records one payment;
   sending a paid/partially paid invoice preserves its financial state.
5. Unpaid invoices remain editable. Printing, public sharing and manual cash/card
   recording work; the decorative "scan to pay" placeholder has been removed.
6. Customer, vehicle and report workflows have EN/RU/UZ translations. Report
   financials have an explicit currency selector; customer debt/history displays
   separate currency amounts. Old unlinked service costs retain their legacy USD
   meaning; linked history uses its final invoice amount and currency. No exchange-rate
   conversion or addition of USD and UZS is performed.
7. At phone widths, invoice fields stack and billing has list/document navigation.
   Selecting a sidebar page closes the mobile menu. Inventory, settings and support
   are marked **Tez orada** because their pages are unfinished.

### Upgrade an existing local demo

From `backend/`, apply migrations before starting the updated API:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.seeds.demo
```

The nonfresh seed preserves existing demo records and adds the common Chevrolet
Cobalt, Spark, Nexia, Gentra and Damas catalog entries idempotently. Avoid `--fresh`
when keeping existing work. The payment migration adds an optional request key;
clients should reuse the same `Idempotency-Key` for retries of one payment intent.
Reusing that key with changed payment details returns a conflict.

Focused browser regressions live in `admin-dashboard/e2e/daily-use.spec.ts` and
the complete service-work journey in `e2e/service-work-invoice.spec.ts`. Run them
against an isolated seeded local database; they create real demo records.

Financial reconciliation compares ledger amounts and balances for active,
nonvoid final invoices in the selected currency. Historical ledger entries remain
visible and unchanged; issued-revenue statistics describe the historical issuance
stream. Only the computed reconciliation check is presented as verified.

### Local verification — 2026-10-02

- Backend: **144 tests passed** on an isolated PostgreSQL database at the latest
  migration. This includes concurrent booking/code allocation/payment retry,
  tenant boundaries, refunds, mixed currencies and fresh completed-work history.
- Browser: **24 distinct Chromium scenarios passed** across staff, customer,
  localization, daily reception and service-work/invoice flows. The first full
  run passed 23; its old English-only global-search locator was updated and that
  scenario passed on rerun. The final report/localization scenario also passed
  after reconciliation labels were clarified.
- Dashboard: TypeScript, lint and production build passed. EN/RU/UZ coverage has
  **763 consistent keys**, with no new localization-audit violations. Two existing
  marketing-image lint warnings and the unrelated translation backlog remain.
- Nonfresh demo seeding preserved existing records and added the five Chevrolet
  model entries. Test API/dashboard/PostgreSQL processes were temporary.

This establishes the agreed local demo scope. A pilot in a real garage,
production deployment, payment-provider integration and unfinished sections
remain separate work.

---

## 0. Prerequisites

| Service | Command | URL |
|---|---|---|
| Backend | `cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8010` | http://127.0.0.1:8010 |
| Frontend | `cd admin-dashboard && npx next dev -p 3000` | http://127.0.0.1:3000 |
| Seed | `cd backend && .venv/Scripts/python -m app.seeds.demo --fresh` | — |

- `admin-dashboard/.env.local` must point at the backend: `NEXT_PUBLIC_API_URL=http://127.0.0.1:8010/api/v1`.
- **Restart the backend after adding any route** — `--reload` is unreliable here and can spawn zombie workers on the old routes.

**Demo logins** (password `parol12345`):
- Garage A (blue brand): `admin@demo.garageos.app`
- Garage B (orange brand): `admin@northside.garageos.app`

These seeded demo accounts are read-only when `DEMO_MODE_ENABLED=true`, including
when signing in with email and password.

---

## The walkthrough

> Log in as **Garage A**. The login form is pre-filled with the demo credentials.

1. **Dashboard** — `/dashboard`. Executive view: active appointments, fleet health ring, weekly revenue, today's schedule, certified vehicles.
2. **Calendar** — `/calendar`. Scheduling grid: technician columns, slots, drag-to-move appointments. *(Calendar plans; Appointments manages.)*
3. **Appointments** — `/appointments`. The operational queue: KPI strip, status + date quick-filters (Today / This week / Overdue), search, bulk confirm/cancel, a per-row `⋯` menu into Customer 360 / Vehicle / Passport / Reschedule, and **Health + Billing** columns (Paid / balance / Overdue / Est) — the operational loop at a glance.
3a. **Billing** — `/billing`. The commercial workspace: rail (Invoices / Estimates / Payments / Overdue / Awaiting / Drafts) + KPIs, a document queue, and the document. **Estimate = blue** (Approve / Reject / Convert); **Invoice = green** (Record payment / Share / Print). Record the full balance → status flips to Paid; a partial payment retains the remaining debt. Approve an estimate → Convert to invoice once, preserving its currency.
4. **Customer 360** — from any row, open the customer. One command center: vehicles, passports, timeline, appointments, LTV, tier — plus a **Financial** tab (Commercial Health ★, outstanding, avg days to pay, invoices/estimates/payments) and financial KPIs in the header.
5. **Vehicle Health** — open a vehicle. Animated health gauge + component breakdown + due-services.
6. **Passport** — from the vehicle, open its **Certified Vehicle Passport** (`/passport/{id}`, public route). Health hero, service history, QR, dealer stamp, garage branding.
7. **Print Passport** — use the Print/Download action on the passport. Print styles produce a clean certificate.
8. **Global Search** — press **⌘K / Ctrl+K** anywhere. Search a name, plate, VIN, or mechanic; jump instantly.
9. **Notifications** — click the **bell**. One event stream: appointment/vehicle/case/message events with severity. Mark-all-read clears the badge.
10. **Inbox** — `/inbox`. The home of work: *"what needs a human, right now."* Work-queue rail, Linear-style list with a "why is this open?" status line + AI chip. Open a thread → **Activity** (events + messages interleaved) vs **Messages**; context panel with distinct **Assigned / Following / Participants**, linked records, Copilot. Try keys: `j`/`k` move, `r` reply, `i` note, `f` follow, `[` / `]` context.
11. **Operations** — `/operations`. Dispatch console: severity rail with live SLA timers, case lifecycle stepper, map, technician dispatch board, and the **live conversation** in the right pane.
12. **Operations → Inbox** — in the Operations conversation pane, click **"Open in Inbox"**. Same thread, full workspace. *(Proof: one conversation model.)*
13. **Inbox → Operations** — in that thread's header, click **"Open case"** → back to the dispatch case, preselected.
14. **Tenant branding (Garage B)** — sign out, log in as **`admin@northside.garageos.app`**. Same backend, **orange** brand, "Northside Auto" name/monogram — white-label proven.
15. **Language** — top-bar language switcher → **Русский**, then **Oʻzbek**. Shell (nav, chrome, search) localizes instantly and persists. *(Page bodies are localized incrementally.)*

**End.**

---

## Regression checklist

Run before every merge to `main`. All must pass.

- [ ] 1. Dashboard loads with live stats
- [ ] 2. Calendar renders the scheduling grid
- [ ] 3. Appointments queue: rows + KPI strip + filters + Health/Billing columns
- [ ] 3a. Billing workspace: invoice (green) + estimate (blue); record payment / convert
- [ ] 4. Customer 360 opens, incl. Financial tab + Commercial Health
- [ ] 5. Vehicle Health gauge renders
- [ ] 6. Passport renders (public route)
- [ ] 7. Passport print/download works
- [ ] 8. Global Search (⌘K) opens and returns results
- [ ] 9. Notification bell opens the feed
- [ ] 10. Inbox: queues + list + thread (Activity/Messages)
- [ ] 11. Operations: case + live conversation pane
- [ ] 12. Operations → Inbox deep-link works
- [ ] 13. Inbox → Operations ("Open case") deep-link works
- [ ] 14. Tenant B branding (Northside / orange)
- [ ] 15. Language switch EN / RU / UZ

> Automated helper: a Playwright script covering these lives in team scratch;
> the manual pass above is the source of truth for demos.
