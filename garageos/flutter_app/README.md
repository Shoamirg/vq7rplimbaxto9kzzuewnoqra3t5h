# GarageOS Flutter staff app

First working Flutter slice of the uploaded GarageOS design: **customer + car → appointment → assigned service work → one linked UZS invoice → manual payment record**. Scope: [GitHub issue #7](https://github.com/Shoamirg/garageos/issues/7). The existing Next.js dashboard and FastAPI backend remain available.

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

Manual payment recording saves money already received. It does not charge a card or connect Payme/Click/Stripe. Server currency and totals remain authoritative; currencies are not converted or summed together. Invoice lists follow the existing API's latest-80 limit; appointments and customers use server pagination/search.

## Implemented

- Uzbek staff sign-in and token refresh; visible errors/retry and account exit.
- Search/paginate customers and appointments; choose current-day or all dates and workflow status.
- Register customer and car, create a direct appointment, assign usta, confirm/start/complete/cancel.
- Create multiple service/part/fee lines and explicit 0%/12% tax; open the existing invoice on repeat creation.
- View invoice, currency-aware totals, receipt history and customer-facing view; record cash/card/bank partial/full payments safely.
- Signal orange theme, bundled OFL Golos Text, reusable plates/status badges, light/dark mode, phone/tablet navigation and 48dp+ controls.
- Guard unsaved forms when going back/cancelling, keep the first invalid field visible/focused, and honor reduced-motion preferences.

## Review and automation

This milestone uses the `ask-matt` implementation/review flow, a separate Standards/Spec code review and the applicable native equivalents of `web-design-guidelines`. The design audit also checks the real bundled font, phone/tablet layouts and light/dark contrast. HTML/DOM-specific recommendations are not treated as Flutter native APIs.

GitHub CI has a separate Flutter job pinned to the SDK above. It runs analysis, unit/widget tests and the real API journey against its own migrated Postgres database, then builds web with a bundled renderer. The existing backend and Next.js jobs remain separate.

Local verification on 2026-10-03: **19 Flutter tests including the real API journey**, **10 targeted backend tests**, clean analysis, web release build and Android debug APK build. The web demo was also opened in Chrome at phone width. iOS builds and physical Android device tests have not been run.

## Subsequent milestones

The 100 HTML files are the complete reference, not 100 implemented Flutter screens. Customer app, console, real SMS/OTP/push, inspection/photos/signatures, richer job pipeline, estimates/approval UI, inventory, staff role screens, payment gateways, refunds UI, printable/shareable mobile documents and production rollout remain separate milestones. iOS project files exist; iOS signing/build/device tests require macOS/Xcode. Android APK signing currently uses a development key and is for local testing, not store publication.

## Layout

`lib/domain`: typed API models and integer minor-unit money. `lib/data`: API/refresh, live and demo repositories, durable payment intent store. `lib/design`: theme tokens and shared widgets. `lib/ui`: staff screens and form state. `app_state.dart`: account/theme state.

## Verify / build

```sh
flutter analyze
flutter test
flutter build web --release --no-web-resources-cdn
flutter build apk --debug
```

Optional reproducible screenshots:

```sh
flutter test test/layout_test.dart --dart-define=WRITE_PREVIEWS=true
```

Screenshots: [phone light](docs/previews/staff-light.png), [phone dark](docs/previews/staff-dark.png), [tablet](docs/previews/staff-tablet.png). The workflow widget test uses the bundled font, 360dp width and 130% text scaling, through split payment completion.

The live API test is skipped by default. To run it, use an isolated loopback database named `garage_test`, migrated and with `ENVIRONMENT=test`. From `garageos/backend` create its isolated accounts (the helper never resets data):

```powershell
.\.venv\Scripts\python.exe ..\flutter_app\tool\seed_api_smoke.py "$env:TEMP\garageos-flutter-smoke.json"
# Run the test-configured API on 127.0.0.1:8010, then from flutter_app:
flutter test test/live_api_test.dart --dart-define=RUN_LIVE_API=true --dart-define=API_URL=http://127.0.0.1:8010/api/v1 --dart-define="SMOKE_FIXTURE=$env:TEMP\garageos-flutter-smoke.json"
```

The test authenticates real staff, adds customer/car, verifies tenant isolation, runs the lifecycle, verifies one UZS invoice and repeated/partial/full payment handling. Stop temporary test servers after the check. Build output is ignored by Git.
