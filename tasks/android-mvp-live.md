# GarageOS Android MVP implementation

User-authorized plan, 2026-10-25. Branch: `feat/android-mvp-live`.

Latest steering: stop excessive tests and finish a practical working checkpoint.
Broad suites and full native acceptance are deferred; do not claim 31/31 complete.

## Acceptance scope

All 31 mobile screens use an isolated local FastAPI/PostgreSQL/Redis backend.
Android emulator only. Local SMS and in-app notifications. Roadside request,
photo, location and status tracking. Payme preparation only; merchant selection,
real payments, Firebase/Eskiz delivery, Railway deployment and physical-device
acceptance are deferred. Never substitute demo data for a failed live request.

## Progress

- [x] Verify repository identity and read GarageOS overview/session/Next.
- [x] Create integration branch and merge main without conflicts.
- [x] Import standalone backend mobile APIs from verified `3ae7092`.
- [ ] Install and verify Android Studio, Flutter 3.47.6, JDK and Android SDK.
- [x] Configure API 36, 33 and 24 emulators; verify acceleration (compatibility runs pending).
- [x] Start isolated local backend; migrate and seed two garages and three roles.
- [x] Connect customer auth, portal, health/passport, billing, chat and roadside.
- [x] Connect reception inbox/account opening, drafts and paid pagination.
- [x] Add secure session restore, photos/location and lifecycle-aware polling (native acceptance pending).
- [x] Implement local notification delivery and Payme protocol preparation (acceptance pending).
- [ ] Run Flutter/backend/migration/tenant/idempotency regressions.
- [ ] Run and record every screen and end-to-end workflow on emulator.
- [ ] Produce verified APK and architecture/setup/acceptance documentation.

Current main.dart APK: GarageOS Dev 0.2.0+4, x86_64, 87,184,912 bytes. Installed,
opened and restored a real local synthetic customer session. No embedded fixture
material detected. Core API reauthentication and local customer read contracts
passed. Final publishing and source pinning are being completed.

## Evidence rules

Record actual command results and screenshots under ignored
`ci-evidence/android-mvp/`. A build, widget test or demo screenshot alone does
not count as live emulator acceptance. Record unrun and failed tests honestly.
Keep local test identities and secrets out of commits and screenshots.

## Verified 2026-10-25 progress

Flutter suite: 122 passed, 2 skipped. Additional secure-store/lifecycle boundaries:
3 passed. Localization: 455 complete messages per language. Analyze passed before
the latest small formatting change; final rerun pending. Main and integration
Android debug builds succeeded. Native acceptance remains incomplete: initial
workflow reached photo chat then GPS timeout, and deletion missed its required
password. Both implementations were fixed; DDS/driver connectivity currently
needs a successful rerun. Never publish the integration APK with embedded fixture.

Backend focused initial run: 42 passed/1 failed (draft payment); guard fixed.
Broader run was interrupted by an unresponsive Docker/WSL VM. Docker recovered
without deleting volumes. The next run passed 67 tests before discovering that
backup CLI tests require the monorepo scripts mounted too. Full retry uses a
read-only monorepo mount and a separate test database. Android Studio launched
with an isolated cache; its first-run telemetry privacy choice awaits the user.
