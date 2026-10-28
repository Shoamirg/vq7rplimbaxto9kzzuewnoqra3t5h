# GarageOS local Android environment

Scope: Windows 11, Flutter 3.47.6 / Dart 3.13.5, JDK 21, Android SDK 36.
Android Studio 2026.2.1.8 and Flutter/Dart plugins are installed for this PC.
The Android toolchain and licenses passed `flutter doctor -v`. WHPX acceleration
returned usable. Emulator boot/build acceptance is recorded separately below.

## Paths

- Flutter: `C:/Users/u0129/develop/flutter`
- Portable JDK: `C:/Users/u0129/develop/jdk-21.0.12.1+1`
- SDK: `C:/Users/u0129/AppData/Local/Android/Sdk`
- Application: `garageos/flutter_app` in the primary repository.

User PATH includes Flutter, platform-tools and emulator. Existing terminals and
IDEs need to inherit the refreshed environment. Flutter's SDK/JDK configuration
is also saved explicitly. `android/local.properties` remains machine-local.
Windows desktop Visual Studio tooling is not needed for Android acceptance.

## Local API

From the repository root:

```powershell
docker compose -f garageos/docker-compose.mvp.yml up -d --build
docker compose -f garageos/docker-compose.mvp.yml exec -T backend python -m app.seeds.local_mvp > ci-evidence/android-mvp/local-fixture.json
```

The seed refuses any database other than `garageos_mvp_local` in development.
It creates two synthetic garages, owner/reception/mechanic accounts and customer
logins/vehicles. The fixture contains generated local test credentials; keep it
out of Git, screenshots and memory. Reseeding rotates fixture passwords.

PostgreSQL and Redis have no published host ports. The API is published only at
`127.0.0.1:8000`. `/ready` checks both dependencies. Uploads and database files
use project-specific volumes. Existing production Compose projects are separate.
Stop this environment with `docker compose -f garageos/docker-compose.mvp.yml stop`.
Do not delete volumes to reset a test incident without inspecting their contents.

The emulator reaches the API at `http://10.0.2.2:8000/api/v1`.
`LOCAL_TEST_MODE=true` exposes the synthetic SMS inbox to local test harnesses;
the router is absent in normal deployments and production configuration rejects
that flag. No real SMS, Telegram or Expo delivery is enabled.

## Emulator and build

Use one AVD at a time: API 36 primary, API 33 notification compatibility, API 24
minimum support. Target x86_64, 2 CPU, 2 GB RAM and hardware graphics. Keep Gradle
at its existing two-worker/2 GB limit. Docker service limits are in Compose.

```powershell
flutter doctor -v
flutter devices
cd garageos/flutter_app
flutter run --dart-define=API_URL=http://10.0.2.2:8000/api/v1
```

Debug builds install as `uz.garageos.garageos_staff.dev` / **GarageOS Dev**.
The production application ID and private signing/HTTPS release gates remain
separate. Do not distribute an APK compiled with integration-test fixtures.

## Verification commands

```powershell
flutter analyze
dart run tool/check_l10n.dart
flutter test
flutter test integration_test/android_smoke_test.dart -d emulator-5554
```

On this Windows session, Flutter's DDS/driver channel disconnected. The supported
Android instrumentation runner is also configured. From the repository root:

```powershell
./garageos/scripts/test_android_local.ps1 -Suite live -Serial emulator-5554
./garageos/scripts/test_android_local.ps1 -Suite smoke -Serial emulator-5554
```

This runner refuses physical-device serials, checks local API readiness, builds
the native test harness and copies PNG/JSON evidence without text conversion.
The live suite uses an Android test GPS provider at **41.3, 69.2**; the native
Geolocator plugin still reads Android's actual location service. Emulator console
`geo fix` returned success on this API 36 image but left its old location intact.
The test provider and shell mock-location mode are restored in `finally`.
Integration APKs contain generated synthetic credentials and must never become
release assets. Build the distributable Dev APK from `lib/main.dart` separately.

Run backend tests in `garageos_mvp_tests`, never the local acceptance database.
Override `ENVIRONMENT=test`, `LOCAL_TEST_MODE=false`, `CUSTOMER_SELF_ENROLLMENT=false`, and upload
storage to a temporary test directory. Migrate and seed reference/demo fixtures
before API tests. Save command logs/JUnit and emulator captures under ignored
`ci-evidence/android-mvp/`; record actual outcomes in the acceptance document.

## Known installation observations

Command-line tools 23 route legacy sdkmanager calls through Android CLI. Its
Windows wrapper split semicolon package names; invoking the native `android.exe
sdk install` preserved those names. Flutter doctor recognizes the resulting SDK.
Plugin installation returned exit 0 and reported Flutter/Dart installed, with a
shutdown-tracker warning; IDE verification is still required before closing QA.

The default IDE system cache had an inaccessible `.port` socket. A launch using
`STUDIO_PROPERTIES=C:/Users/u0129/develop/android-studio-local.properties` with
`idea.system.path=C:/Users/u0129/develop/android-studio-system` reached the IDE's
first-run telemetry choice. The user must make that privacy choice; it is not
automated. Do not delete the original cache or infer that setup is complete.

For backend tests inside the local image, mount the monorepo at
`/workspace/garageos:ro` and use `/workspace/garageos/backend` as working directory.
The backup CLI contracts also exercise `garageos/scripts`, which a backend-only
bind mount does not provide. Production databases are never used for these tests.
