# GarageOS — Demo & Regression Flow

A scripted ~12-minute end-to-end walkthrough. Doubles as the **release regression
checklist**: if every step passes, the platform is stable enough to merge/ship.

Last verified: 2026-07-02 (UCP milestone, commit `d390acd` / merge `6d7ca7c`).

---

## 0. Prerequisites

| Service | Command | URL |
|---|---|---|
| Backend | `cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8010` | http://127.0.0.1:8010 |
| Frontend | `cd admin-dashboard && npx next dev -p 3000` | http://127.0.0.1:3000 |
| Seed | `cd backend && .venv/Scripts/python -m app.seeds.demo --fresh` | — |

- `admin-dashboard/.env.local` must point at the backend: `NEXT_PUBLIC_API_URL=http://127.0.0.1:8010/api/v1`.
- **Restart the backend after adding any route** — `--reload` is unreliable here and can spawn zombie workers on the old routes.

**Demo logins** (password `demo1234`):
- Garage A (blue brand): `admin@demo.garageos.app`
- Garage B (orange brand): `admin@northside.garageos.app`

---

## The walkthrough

> Log in as **Garage A**. The login form is pre-filled with the demo credentials.

1. **Dashboard** — `/dashboard`. Executive view: active appointments, fleet health ring, weekly revenue, today's schedule, certified vehicles.
2. **Calendar** — `/calendar`. Scheduling grid: technician columns, slots, drag-to-move appointments. *(Calendar plans; Appointments manages.)*
3. **Appointments** — `/appointments`. The operational queue: KPI strip, status + date quick-filters (Today / This week / Overdue), search, bulk confirm/cancel, and a per-row `⋯` menu that jumps to Customer 360 / Vehicle / Passport / Reschedule.
4. **Customer 360** — from any row, open the customer. One command center for a customer: vehicles, passports, timeline, appointments, LTV, tier.
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
- [ ] 3. Appointments queue shows real rows + KPI strip + filters
- [ ] 4. Customer 360 opens for a customer
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
