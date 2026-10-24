# GarageOS Mobile: 31-screen redesign (Flutter)

Applies the "GarageOS Mobile" master prompt to the existing Flutter app
(`garageos/flutter_app`) instead of a new React Native/Expo project. The
prompt's tokens, patterns, states and role panels are implemented as Flutter
widgets; existing live API wiring, RBAC, idempotency and payment-intent
handling are unchanged.

## Screens

- Shared (5): Welcome (Live G mark, promise, UZ | RU | EN pills, customer /
  staff entry, demo switch), Sign in, Forgot password (code + 60 s resend +
  new password), Settings (language, theme, notifications, version, sign out),
  Notifications prompt.
- Customer (14), dock Home · Cars · Billing · Messages · Profile: Sign up
  (phone & email → SMS code → password → garage when unlinked), Home, My
  cars, Car detail (health ring, 5 areas, due services, visits), Service
  passport (blueprint, verified seal, log, QR), Book a service (car pills,
  date strip, slot pills), My appointments, Billing, Estimate detail (sticky
  approve / decline / ask), Invoice detail (payment vault), Messages, Chat
  thread (photos, max 5), Roadside help (car + problem → pin → 6-stage
  tracker), Profile (delete account behind a bottom sheet).
- Reception (10), dock Jobs · Customers · Invoices · Inbox · Settings: Jobs
  (Today | Ongoing | Awaiting invoice | All, search, date filter, status
  counters, FAB), Job detail (single morphing CTA, status timeline, call,
  cancel reason sheet), New job, Customers, Customer card (lifetime value,
  app-login status, cars, past jobs, invoices, open app login), New customer /
  New car (VIN), Invoices (Drafts | Unpaid | Paid), Invoice editor (labour,
  part, fee, discount; live total; save draft / send), Record payment (method
  tiles, Paid / Partly paid receipt), Inbox.
- Mechanic (2), 64 px dock: My jobs (oversized dark cards), Job detail (one
  64 px pill: start → finish with optional note sheet).

## Data

Every screen reads through a typed source. `DemoRepository` and
`DemoCustomerPortal` carry the prompt's Uzbek sample data (Aziz Karimov,
Cobalt 01 A 777 AA, INV-2026-000142, EST-2026-000012, Usta Sherzod).

Live sessions keep what the API already serves: staff jobs, customers,
invoices, payments; customer vehicles, visits, invoices and booking. Added
live reads: the customer card (`/customers/{id}` and `/invoices?customer_id`),
invoice tabs via list views, and "send" via `/invoices/{id}/send`.

Not yet wired (sample data in demo, a calm "Tez orada" state in live):
customer health, passport, estimates, messages, roadside, change password,
delete account; reception inbox and "open app login". The API has no
customer self sign-up, SMS code or password reset, so live mode tells the
customer that the garage opens and resets logins.

## Deviations from the prompt

- Flutter, not Expo; gen-l10n ARB catalogs (452 keys × UZ/EN/RU), not i18next.
- Material outlined icons, not Lucide (no icon dependency added).
- Notifications "Allow" records consent; no push provider or deep links yet.
- Chat photos are captions until an image picker and upload API exist.
- Roadside shows an approximate pin; no device location plugin.
- Sign-in uses email, matching the API.
- Direct bookings have no service field in the API; New job sends the service
  as the first line of the customer's request, and job cards read it back.
- The API issues invoices on creation, so "Save" in live mode issues rather
  than drafts.
- The API has no paid-only invoice list: the live Paid tab filters the
  payments view (which includes part-paid) page by page, so its count is the
  API's payments count.

New dependencies: `qr` (passport code) and `url_launcher` (call garage /
customer; falls back to copying the number). Android declares the `tel` dial
intent in `<queries>`.

## Verification

- `flutter analyze`: no issues. `dart run tool/check_l10n.dart`: 452 messages
  per language.
- `flutter test`: 122 passed, 2 skipped (live API rehearsal, as before).
  Existing flow, permission, idempotency, list and localization tests were
  moved to the new controls with their assertions kept: infinite scroll keeps
  the page/scroll/search rules the pager had, and a failed refresh keeps the
  rows readable.
- `test/role_screens_test.dart` walks all four role flows in UZ, RU and EN at
  360 dp with 130 % text and fails on any overflow. Run it with
  `--dart-define=CAPTURE_DIR=build/screens` (add `PRIMARY=true` for 390 × 844,
  `DARK=true` for dark) to write a PNG per screen.
- `docs/previews` regenerated with `WRITE_PREVIEWS=true`.
- `integration_test/native_smoke.dart` updated for the new entry flow; not run
  here (no simulator or Xcode on this machine).
