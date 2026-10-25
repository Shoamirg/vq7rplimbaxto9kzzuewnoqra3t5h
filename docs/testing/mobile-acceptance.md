# GarageOS mobile acceptance

Date: 2026-10-25. Branch: `feat/android-mvp-live`.
**Implementation checkpoint — full 31/31 acceptance is deferred.**

The user explicitly requested on 2026-10-25 to stop excessive testing and finish
the useful working result. Broad local suites and repeated native walks were
stopped. The current deliverable is GarageOS Dev 0.2.0+4, installed and opened on
API 36 against the isolated local backend, plus reviewable source and architecture.
It is not a production release or a completed 31/31 acceptance certification.

## Screen matrix

Each row requires an actual Android emulator, live local API and persisted test
data. Widget/demo walks are additional layout coverage, not live acceptance.

| ID | Screen / acceptance action | Live result |
|---|---|---|
| S01 | Welcome: customer/staff entry and explicit demo separation | Pending |
| S02 | Sign in: customer, owner/reception and mechanic; wrong password | Pending |
| S03 | Forgot password: SMS test inbox, wrong/expired code, login afterward | Pending |
| S04 | Settings: language/theme persistence, notification opt-in and logout | Pending |
| S05 | Notification prompt: opt-in/off and new foreground feed delivery | Pending |
| S06 | Sign up: server OTP verification, eligible garage, real account | Pending |
| S07 | Customer home: own garage, current vehicle/work/billing activity | Pending |
| S08 | My cars: owned vehicles and empty state | Pending |
| S09 | Car detail: backend health categories, due items and service history | Pending |
| S10 | Service passport: real record and QR link | Pending |
| S11 | Book service: valid civil date/time; replay creates one request | Pending |
| S12 | My appointments: upcoming/past and refreshed status | Pending |
| S13 | Customer billing: correct issued invoices, balances and receipts | Pending |
| S14 | Estimate: real lines; approve, decline and ask | Pending |
| S15 | Invoice: line totals, partial/full payments; online payment disabled | Pending |
| S16 | Customer messages: owned threads, empty/error states | Pending |
| S17 | Chat: customer/staff exchange, verified photo bytes, replay | Pending |
| S18 | Roadside: real coordinates, denial/retry, photo and status tracking | Pending |
| S19 | Profile: owned identity, password change, account deletion | Pending |
| S20 | Reception jobs: date/status/search, pagination and refresh | Pending |
| S21 | Job detail: legal transitions and stale-state handling | Pending |
| S22 | New job: customer/vehicle ownership and duplicate prevention | Pending |
| S23 | Customers: search/list and tenant boundary | Pending |
| S24 | Customer card: cars/history; owner-only app-login action | Pending |
| S25 | New customer / car: validation, plate/VIN and duplicate identity | Pending |
| S26 | Invoices: drafts/unpaid/paid; accurate backend pagination/count | Pending |
| S27 | Invoice editor: real draft, send once, authoritative totals | Pending |
| S28 | Record payment: partial/full, unknown reply retry and receipt | Pending |
| S29 | Reception inbox: real threads, response and case context | Pending |
| S30 | Mechanic jobs: only assigned work | Pending |
| S31 | Mechanic detail: start/finish, notes and blocked other assignments | Pending |

## Cross-cutting scenarios

- Complete booking → reception confirmation → explicit mechanic assignment →
  mechanic start/finish → invoice issue → split payment → customer history.
- Two-tenant and two-customer ownership boundaries; receptionist/owner finance
  and account-administration permissions.
- Offline/slow replies, duplicate taps, lost mutation replies and session expiry.
- App process restart restores the correct identity; logout/role change clears
  protected state and late callbacks cannot reinstall the previous session.
- UZ/RU/EN; light/dark; 360dp and 130% text; keyboard and permission denial.
- API 36 main acceptance, API 33 and API 24 compatibility smoke runs sequentially.
- Local Payme contract: exact amount, duplicate perform/cancel, cancellation,
  invalid amount and cross-tenant/replay mismatch. No real provider certification.

## Evidence format

Record test ID, steps, expected/actual result, app/backend source revision,
device/API, fixture run ID and evidence path. Do not include test credentials,
OTP values or tokens in the report. A failed test remains failed until a recorded
rerun passes. Capture unrun checks explicitly.

## Current verified milestones

- Final main.dart debug APK: 87,184,912 bytes, package
  `uz.garageos.garageos_staff.dev`, version 0.2.0+4, x86_64 Flutter engine.
  Installed successfully and restored the real synthetic customer session on
  the API 36 emulator. The customer home rendered with live vehicle health.
- Archive content check found no fixture password, encoded fixture, integration
  marker or native test title in the main APK. It is separate from test APKs.
- Flutter full suite at the preceding checkpoint: **128 passed, 2 skipped**.
  Later targeted checks: API client/reauth **17 passed**, logout/storage **5
  passed**, real local portal/estimate contract **1 passed**. Final analyze passed.
- Broad backend run stopped at the user's request: **612 passed, 5 skipped, 2
  failures** before interruption. Both failures were local test database-name
  guards; guards now allow the explicitly isolated `garageos_mvp_tests` database.
  They were not rerun after the user asked to stop broad testing.
- Native secure storage/signup/password/reset/deletion scenario passed. The
  31-screen case retained partial screenshots and stopped on UI finder timing.
  The harness timing was corrected; its full rerun, API 24/33 smoke and native
  picker/permission-denial cases remain deferred. Earlier S01–S13 observations
  do not establish complete acceptance of every listed action.
- The essential final API check confirmed incorrect current-password rejection
  preserves the authenticated session and reports `Asia/Tashkent` for the garage.

The following installation/progress notes record earlier checkpoints and must
not be read as a complete acceptance result.

- Integration branch combines mobile `89c86d4` with main `c02d410`.
- Standalone backend mobile API baseline imported from `3ae7092`.
- Android Studio and Flutter 3.47.6 installed; JDK 21 configured.
- WHPX usable; Android SDK/toolchain and licenses recognized by Flutter doctor.
- Isolated local API, PostgreSQL and Redis passed readiness; two synthetic garages
  seeded; Alembic metadata check reported no new upgrade operations.
- Initial focused backend run: 42 passed, 1 failed. The failure caught payment
  acceptance on a draft; a guard was added and awaits rerun.
- Flutter suite after logout/Sunday fixes: **122 passed, 2 skipped**; additional
  secure storage and lifecycle regression tests: **3 passed**. Evidence:
  `flutter-all.log`, `flutter-native-boundaries.log` under the ignored evidence
  directory. Localization coverage: **455 complete keys in UZ/RU/EN**.
- Native builds succeeded, but native acceptance has not passed. The initial
  real API workflow reached photo chat, then Android GPS timed out. Account
  deletion missed the backend-required password. Both were fixed and rerun
  attempts encountered DDS/driver transport failures. These are open until a
  successful emulator rerun provides evidence.
- Docker/WSL stopped responding during the broad backend suite. The runtime was
  recovered without deleting volumes. A subsequent run passed 67 tests before
  failing because backup CLI tests lacked monorepo scripts in the container.
  Full retry now mounts the monorepo read-only and uses the separate test DB.
