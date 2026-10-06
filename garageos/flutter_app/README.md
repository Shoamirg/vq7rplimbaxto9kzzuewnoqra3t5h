# GarageOS Flutter staff app

First working Flutter slice of the uploaded GarageOS design: **customer + car → appointment → assigned service work → one linked UZS invoice → manual payment record**. Scope: [GitHub issue #7](https://github.com/Shoamirg/garageos/issues/7). The existing Next.js dashboard and FastAPI backend remain available.

For iPhone build checks and partner installation through TestFlight, see the [Uzbek iOS guide](docs/ios.md) and [issue #8](https://github.com/Shoamirg/garageos/issues/8). A simulator/unsigned build is separate from a signed, installable iPhone release.

## Approved design and languages

The approved clean dashboard design is applied to the existing staff screens ([issue #9](https://github.com/Shoamirg/garageos/issues/9), [approved review frontend](https://garageos-mobile-maket-oct3.john-doe-4292.chatgpt.site)). Shared tokens provide white cards, orange primary actions, 16dp card corners and 8dp controls, with a matching dark theme. DM Sans is the body font, Plus Jakarta Sans is used for headings, and Golos Text supplies Cyrillic fallback. All fonts and their SIL OFL licenses are bundled locally.

Use the globe button on sign-in, staff lists or detail/form pages to choose **O‘zbekcha / English / Русский**. Uzbek is the initial default. The choice is stored on this device; switching language keeps the account/demo, selected tab, search/filter state, current route and draft edits. Device storage failure is reported while the selected language still works for the current session; later saves can retry. Dates, money and screen-reader plate labels follow the selected locale; currency and server amounts are unchanged. Names, notes and edited invoice descriptions are customer/staff data and are not translated. Untouched generated service/line defaults follow language changes without marking forms as edited.

`lib/l10n/app_*.arb` are the translation sources. After editing them, run `flutter gen-l10n`; generated Dart files are ignored. `dart run tool/check_l10n.dart` prevents partial catalogs from silently falling back to Uzbek. The full staff widget journey runs in all three languages at 360dp / 130% text.

## Run locally

Flutter **3.47.6 stable**, Dart **3.13.5**. This computer has a portable SDK at `%LOCALAPPDATA%\GarageOS\toolchains\flutter`; no global PATH change is needed.

From this directory in PowerShell:

```powershell
.\tool\run.ps1
```

Or with a Flutter SDK already on PATH:

```sh
flutter pub get
flutter run -d chrome --web-hostname=127.0.0.1 --web-port=8080
```

Choose **Demo rejimni ochish** on the login screen. Demo data is visibly labelled on every screen and lives only in memory. Leaving demo mode or restarting resets it; it never calls the server. Confirm Aziz's appointment, assign an usta, start/complete the work, then create an invoice and record partial/full payments. The invoice eye icon opens a customer-facing view on the same device.

## Connect the existing API

Use an existing staff account and a running, migrated GarageOS backend. The server address can be configured under **Ulanish sozlamalari** or at build/run time:

```sh
flutter run -d chrome --web-hostname=127.0.0.1 --web-port=8080 --dart-define=API_URL=http://127.0.0.1:8000/api/v1
```

Set backend `CORS_ORIGINS` to include the exact web origin `http://127.0.0.1:8080` (and `http://localhost:8080` if using that hostname). Preserve existing allowed origins. No wildcard or auth bypass is needed.

| Device | Backend address |
| --- | --- |
| Browser on this computer | `http://127.0.0.1:8000/api/v1` |
| Android emulator | `http://10.0.2.2:8000/api/v1` (native Android default) |
| Physical Android device | Reachable HTTPS API, or local LAN HTTP in a debug build with an explicitly configured LAN server |
| iOS | Reachable HTTPS API; iOS HTTP restrictions are retained |

Only Android **debug** permits cleartext for local development. Release builds retain platform network restrictions. Access/refresh tokens remain in memory; closing or leaving the app requires sign-in again. Pending payment request UUID, amount and method are stored separately on the device, scoped by API/user/tenant, before sending. Uncertain responses retain the same request across navigation, re-login and app restart. Resolve that request before changing its amount; there is no offline write queue.

Manual payment recording saves money already received. It does not charge a card or connect Payme/Click/Stripe. Server currency and totals remain authoritative; currencies are not converted or summed together. Invoice history uses server search and pages of 30: search by invoice code, customer, vehicle model or plate. Search resets to page 1; tab/detail return and language changes retain the current search/page/scroll. Loading, retry and clear-search states are available in UZ/EN/RU. Demo mode applies the same search and pagination in memory.

`GET /api/v1/invoices` accepts `q` (at most 100 characters; trimmed, case-insensitive literal substring), `page` (1–2,147,483,647; larger values return 422 before database offset overflow) and `page_size` (1–100). Search also supports VIN on the live API. The response adds `total`, `page`, `page_size` and `total_pages`; `total` counts matching active documents in the selected view and garage. Existing `items`, global garage `counts`, `kpis` and `view` remain. Documents sort by creation time and ID descending, including timestamp ties. Callers omitting pagination still receive a bounded first page of up to 80 documents. No database migration is required.

Invoice history previews use synthetic read-only fixtures at 130% text: [Uzbek phone](docs/previews/invoices-uz-360.png), [Russian phone](docs/previews/invoices-ru-360.png), [English tablet](docs/previews/invoices-en-1024.png). Regenerate all three languages at phone/tablet sizes with `flutter test test/invoice_history_test.dart --dart-define=WRITE_PREVIEWS=true`.

## Staff permissions

Live sign-in reads effective `permissions` from `/auth/me`; deploy the API and
mobile changes together. Missing read permission or a missing permissions field
rejects entry. Accounts with `staff.read` but no `staff.write` see a localized
read-only notice and can inspect customers, vehicles, appointments and existing
invoices/customer-facing views. Intake, vehicle creation, work transitions,
invoice creation and payment controls are hidden. The server independently
enforces these permissions, including direct API calls.

Admin, manager, receptionist and super-admin roles retain the tenant staff
workspace. Mechanic accounts instead receive `work.read.assigned` and
`work.write.assigned`: Flutter opens **My work**, across all dates, and uses the
dedicated `/mechanic/work` API. Mechanics can read their assigned jobs and
start/complete them, without customer lists, billing, payment or assignment
controls. The API checks the account assignment again under the job lock before
each transition. Reception can still operate billing; fine financial approvals
remain a later milestone. Offline demonstration stays editable with example data.

The admin web appointment editor and live mobile assignment picker select active
mechanic accounts by ID, showing email to distinguish equal names. Deploy the
mechanic-account migration before these clients. Legacy name-only assignments
remain intact and appear in a mechanic's app only after explicit account
assignment; names are never guessed as ownership. See
[mechanic workflow](../docs/MECHANIC-WORKFLOW.md). Customer Flutter and superadmin
web panels in #18 are subsequent increments, not included in this slice.
Suspending a user, garage or global role denies login and existing tokens; a
`401` during refresh clears the mobile session. Role changes are enforced by the
server immediately; sign in again to refresh the mobile controls after a role
change. Pending payment intents remain scoped to the same API/user/garage and
are not deleted by logout.

## Implemented

- Uzbek, English and Russian staff screens, sign-in and token refresh; visible errors/retry and account exit.
- Search/paginate customers and appointments; choose current-day or all dates and workflow status.
- Keep each staff tab's search, filters and scroll position; load tabs on first visit and refresh when revisited. Search after a short pause or submit, and clear filtered empty results with one action.
- Keep list headings/actions during loading or failure. Same-filter refreshes retain disabled prior rows and scroll position until current results are available; changing search, filters or page starts at the top.
- Register customer and car, create a direct appointment, assign usta, confirm/start/complete/cancel.
- Create multiple service/part/fee lines and explicit 0%/12% tax; open the existing invoice on repeat creation.
- View invoice, currency-aware totals, receipt history and customer-facing view; record cash/card/bank partial/full payments safely.
- Approved white/orange theme, bundled OFL DM Sans/Plus Jakarta Sans/Golos Text, reusable plates/status badges, light/dark mode, phone/tablet navigation and 48dp+ controls.
- Guard unsaved forms when going back/cancelling, keep the first invalid field visible/focused, and honor reduced-motion preferences.

## Review and automation

This milestone uses the `ask-matt` implementation/review flow, a separate Standards/Spec code review and the applicable native equivalents of `web-design-guidelines`. The design audit also checks the real bundled font, phone/tablet layouts and light/dark contrast. HTML/DOM-specific recommendations are not treated as Flutter native APIs.

GitHub CI has a separate Flutter job pinned to the SDK above. It runs analysis, unit/widget tests and the real API journey against its own migrated Postgres database, then builds web with a bundled renderer. The existing backend and Next.js jobs remain separate.

Initial staff milestone verification on 2026-10-03: **19 Flutter tests including the real API journey**, **10 targeted backend tests**, clean analysis, web release build and Android debug APK build. The web demo was also opened in Chrome at phone width. At that milestone, iOS builds and physical Android device tests had not been run.

Staff-list increment verification on 2026-10-03: **25 Flutter tests including the real API journey and six UI regressions**, clean analysis, release web build, and **144 existing backend tests** against an isolated migrated and CI-seeded PostgreSQL database. Regressions cover independent searches/status filters across tabs, lazy loading, no theme-only refetch, out-of-order responses, pending/error/empty recovery, and customer/invoice scroll retention through refresh failures. The layout checks retain their touch-target assertions and scroll the action into view before measuring it. Android/iOS native builds were not rerun for this increment.

Design/language increment on 2026-10-03: **34 local Flutter tests passed**, with the optional live API test skipped locally; clean analysis and **215 complete messages per language**. Six localization regressions cover persisted choice, retained drafts/validation/tab/search, browser storage failures and recovery, pristine translated defaults and accessible plate labels. The complete service-work/invoice/split-payment flow passes in UZ/EN/RU at 360dp and 130% text. Five font-rendered layout checks cover light/dark phone, tablet, English and Russian. Current CI runs the live API journey and web build; its results are linked in issue #9.

The preceding iOS increment on `5b9ff42` passed an unsigned iPhone release build and two native simulator tests on macOS/Xcode ([run](https://github.com/Shoamirg/garageos/actions/runs/37099097524)). The current iOS workflow adds language persistence as its third native test; current results are tracked in issue #9. Physical Android/iPhone testing, Apple signing and TestFlight distribution remain pending.

## Subsequent milestones

The 100 HTML files are the complete reference, not 100 implemented Flutter screens. Customer app, console, real SMS/OTP/push, inspection/photos/signatures, richer job pipeline, estimates/approval UI, inventory, staff role screens, payment gateways, refunds UI, printable/shareable mobile documents and production rollout remain separate milestones. iOS project files exist; iOS signing/build/device tests require macOS/Xcode. Android APK signing currently uses a development key and is for local testing, not store publication.

## Layout

`lib/domain`: typed API models and integer minor-unit money. `lib/data`: API/refresh, live and demo repositories, durable payment intent store. `lib/design`: theme tokens and shared widgets. `lib/l10n`: ARB translations and presentation formatting. `lib/ui`: staff screens and form state. `app_state.dart`: account/theme/language state.

## Verify / build

```sh
dart run tool/check_l10n.dart
flutter gen-l10n
flutter analyze
flutter test
flutter build web --release --no-web-resources-cdn
flutter build apk --debug
```

Optional reproducible screenshots:

```sh
flutter test test/layout_test.dart --dart-define=WRITE_PREVIEWS=true
```

Screenshots: [phone light](docs/previews/staff-light.png), [phone dark](docs/previews/staff-dark.png), [tablet](docs/previews/staff-tablet.png), [English](docs/previews/staff-en.png), [Russian](docs/previews/staff-ru.png). The workflow widget test uses bundled fonts, 360dp width and 130% text scaling in UZ/EN/RU, through split payment completion.

The live API test is skipped by default. To run it, use an isolated loopback database named `garage_test`, migrated and with `ENVIRONMENT=test`. From `garageos/backend` create its isolated accounts (the helper never resets data):

```powershell
.\.venv\Scripts\python.exe ..\flutter_app\tool\seed_api_smoke.py "$env:TEMP\garageos-flutter-smoke.json"
# Run the test-configured API on 127.0.0.1:8010, then from flutter_app:
flutter test test/live_api_test.dart --dart-define=RUN_LIVE_API=true --dart-define=API_URL=http://127.0.0.1:8010/api/v1 --dart-define="SMOKE_FIXTURE=$env:TEMP\garageos-flutter-smoke.json"
```

The test authenticates real staff, adds customer/car, verifies tenant isolation, runs the lifecycle, verifies one UZS invoice and repeated/partial/full payment handling. Stop temporary test servers after the check. Build output is ignored by Git.
