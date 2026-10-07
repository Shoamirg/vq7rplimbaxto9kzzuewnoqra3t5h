# Local Windows Jenkins

The initial Jenkins installation lives under `%LOCALAPPDATA%/GarageOS/jenkins`.
It listens only at <http://127.0.0.1:8180/>. Its Java21 runtime is separate from
the system Java17. `home` contains Jenkins configuration, plugins, accounts and
build history; `agent` contains the independent Windows build workspace.
Controller executors are disabled and the agent has one executor.

The administrator credentials are in `admin.json` in the protected installation
directory. Read that file locally to log in; never commit it or copy it into an
issue, build artifact or console log. Jenkins keeps authentication and CSRF
protection enabled. The local setup is for trusted code only: the job fetches
`codex/service-work-demo`, uses this Windows user's existing GitHub CLI keyring
through its Git credential helper, and does not execute arbitrary pull requests.

## Start and stop

The user Startup folder has a **GarageOS Jenkins** shortcut to the installed copy
of `start_local_jenkins.ps1`. Jenkins starts after this user logs in. The PC must
remain on and this user must remain logged in. This is not a Windows system
service or an Internet-accessible deployment.

To start manually, run:

```powershell
& "$env:LOCALAPPDATA/GarageOS/jenkins/start_local_jenkins.ps1"
```

The launcher checks recorded PID, executable path and start time before reusing
its processes. The matching controller/build-agent identities are stored in
`controller.json` and `build-agent.json`; stop only those matching processes.
Remove the named Startup shortcut to disable automatic startup. Keep Jenkins
home and its credentials when stopping or upgrading. Cancel running builds and
wait for fixture cleanup before stopping Java. For each recorded process, verify
its executable/start time before stopping it:

```powershell
$install = Join-Path $env:LOCALAPPDATA 'GarageOS/jenkins'
$runtime = Get-Content "$install/runtime.json" -Raw | ConvertFrom-Json
foreach ($name in 'build-agent', 'controller') {
    $identity = Get-Content "$install/$name.json" -Raw | ConvertFrom-Json
    $process = Get-Process -Id $identity.pid -ErrorAction SilentlyContinue
    if ($process -and $process.Path -eq $runtime.java -and
        $process.StartTime.ToUniversalTime().Ticks -eq ([datetime]$identity.started).ToUniversalTime().Ticks) {
        Stop-Process -Id $process.Id
    }
}
```

When upgrading Jenkins, stop both processes, replace the verified WAR, and
remove only `agent.jar` so the next launch downloads matching Remoting. After changing the launcher
in this repository, copy it to the installation directory before restarting.

## Trusted-branch build

The local `GarageOS-Windows-CI` Pipeline polls the trusted branch every five
minutes. Its bootstrap fetches an independent checkout, records the attempted
SHA and loads that checkout's `Jenkinsfile`. Unchanged SHAs are not rebuilt on
every poll, including failed attempts; choose **FORCE_RUN** for an explicit retry.
There is no automatic deployment, merge or tag. GitHub Actions workflow
definitions are retained with manual triggers. Dispatch is not yet verified:
GitHub requires the workflow on the default branch, which currently contains
only `ci.yml`; `staff-browser.yml` and `flutter-ios.yml` remain on this feature
branch. Their activation needs an authorized merge/default-branch update and
the account billing issue resolved. Preserved definitions are not an immediately
available fallback or Jenkins evidence. See
[GitHub manual workflow requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

The versioned runner creates a new loopback `garage_test` PostgreSQL cluster for
each build and refuses occupied ports 55444,8010,3001. It runs migrations/schema,
pre-seed public API checks, full backend tests, frontend typecheck/locales/lint/
build, Flutter UZ/EN/RU message validation/analyze/full live API tests/web build and
the four existing production browser suites. Test services stop in `finally`,
the generated Flutter credential fixture is removed, and logs/JUnit results are
archived under that build's `ci-evidence` directory. No existing database is reset.
Build databases/logs are retained locally for diagnosis; no broad Docker or
filesystem cleanup is performed.

After browser tests, the owned API/database fixtures stop before Android release
packaging starts. Android SDK36/build-tools36.0.0 and the private Java21 runtime
are required on this agent; override their paths with `GARAGEOS_ANDROID_SDK` and
`GARAGEOS_ANDROID_JAVA_HOME` if needed. The native gate exercises actual signing
and API guard failures, builds three signed split APKs with a disposable QA key,
verifies certificates/manifests/ABIs/hashes and preserves ordinary debug builds.
Signing fixtures stay outside the checkout and evidence, then are deleted; only
the marked `ci-tools/android-gradle` cache's daemons are stopped. Archived
`QA-ONLY-*` APKs use a synthetic API and temporary identity; they must not be
distributed to clients. See the [Android release guide](../../garageos/flutter_app/docs/android-release.md)
for owner signing and physical-device acceptance still required for delivery.

Docker Linux containers are required for the existing production Caddy routing
and Docker build-context gates. When the engine is unavailable, all other gates
still run but the build is **UNSTABLE**, with the missing gates recorded in its
artifacts. Such a build is not full CI acceptance. Once Docker is available,
retry with FORCE_RUN; routing failures fail the build normally. Native iOS still
requires a separate Mac/Xcode agent and signing remains a release gate.

This PC now uses a separate Docker Engine in the existing `Ubuntu-24.04` WSL
distro for those two Linux-container gates. `runtime.json` sets
`dockerWslDistro` to `Ubuntu-24.04`; the launcher passes it as
`GARAGEOS_DOCKER_WSL_DISTRO`. The runner starts that distro's local Docker service
with WSL's root user, probes it as the default Linux user, and executes the
unchanged routing/build-context scripts there using Linux paths. All application
checks still run on the Windows agent. Docker Engine was installed from Docker's
signed official Ubuntu apt repository; the existing Linux user belongs to its
Docker group. No TCP Docker API or SSH server is exposed. Windows Docker Desktop
storage/context are separate; its startup defect remains unresolved.

Docker's systemd service starts when WSL starts. After editing `runtime.json` or
the launcher, wait for builds to finish, stop only the recorded matching
`build-agent` process, then run the launcher to refresh the agent environment.
The existing controller can stay running. WSL tests stop their own uniquely
named containers/networks through the existing suite cleanup. After builds finish,
`wsl --distribution Ubuntu-24.04 --user root --exec systemctl stop docker docker.socket`
stops this engine; the next build starts it again. Do not terminate the whole distro while unrelated Linux work
is running. Other Ubuntu activity is outside Jenkins ownership.

The local Windows tool paths are held in `runtime.json`, outside Git. The Flutter
SDK must be3.47.6. Python3.12, Node, Git/GitHub CLI, PostgreSQL binaries and the
user's GitHub keyring must stay available to the logged-in build agent.
