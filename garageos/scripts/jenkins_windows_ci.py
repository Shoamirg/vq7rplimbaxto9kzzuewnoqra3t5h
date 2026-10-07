"""Windows Jenkins gates with fresh owned PostgreSQL and bounded fixture lifetime.

Exit 3 means application gates passed but Docker transport gates were not run.
Never reset an existing database or silently turn an unavailable gate green.
"""
from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = Path(os.environ.get("WORKSPACE", str(ROOT.parent))).resolve()
STATE_ROOT = WORKSPACE / "ci-state"
EVIDENCE = ROOT / "ci-evidence" / os.environ.get("BUILD_NUMBER", "manual")
STATE = STATE_ROOT / "owned.json"
PG = Path(os.environ.get("GARAGEOS_PGBIN", "C:/Program Files/PostgreSQL/18/bin"))
FLUTTER = Path(os.environ.get("GARAGEOS_FLUTTER", str(Path(os.environ["LOCALAPPDATA"]) / "GarageOS/toolchains/flutter/bin/flutter.bat")))
BACKEND = ROOT / "garageos/backend"
DASHBOARD = ROOT / "garageos/admin-dashboard"
APP = ROOT / "garageos/flutter_app"
# Changing the requirement set selects a fresh owned environment. pip install
# alone would leave removed packages (e.g. python-jose/ecdsa) installed.
TOOLS = WORKSPACE / "ci-tools"
DEPS_KEY = hashlib.sha256((BACKEND / "requirements.txt").read_bytes()
                          + (BACKEND / "requirements-dev.txt").read_bytes()).hexdigest()[:12]
PYTHON = TOOLS / ("backend-py312-" + DEPS_KEY) / "Scripts/python.exe"
AUDITOR = TOOLS / "pip-audit-2.10.1/Scripts/python.exe"
ENV = dict(os.environ, PYTHONUTF8="1", ENVIRONMENT="test", RATE_LIMIT_ENABLED="false",
           DATABASE_URL="postgresql+asyncpg://postgres@127.0.0.1:55444/garage_test",
           SECRET_KEY="jenkins-isolated-test-only-not-production",
           NEXT_PUBLIC_API_URL="http://127.0.0.1:8010/api/v1", BASE_URL="http://localhost:3001",
           NEXT_TELEMETRY_DISABLED="1")
PROCESSES = []
HANDLES = []


def run(args, cwd, name):
    print(f"GATE {name}", flush=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with (EVIDENCE / (name + ".log")).open("w", encoding="utf-8") as output:
        result = subprocess.run([str(a) for a in args], cwd=cwd, env=ENV,
                                stdout=output, stderr=subprocess.STDOUT,
                                creationflags=subprocess.CREATE_NO_WINDOW)
    print(f"RESULT {name}: {result.returncode}", flush=True)
    if result.returncode:
        print((EVIDENCE / (name + ".log")).read_text(encoding="utf-8", errors="replace")[-6000:], flush=True)
        raise RuntimeError(name + " failed")


def save(state):
    STATE_ROOT.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state), encoding="utf-8")


def process_birth(pid):
    """A persisted creation time prevents cleanup from killing a reused PID."""
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
    kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        return None
    values = [wintypes.FILETIME() for _ in range(4)]
    try:
        exit_code = wintypes.DWORD()
        if not kernel.GetExitCodeProcess(handle, ctypes.byref(exit_code)) or exit_code.value != 259:
            return None
        if not kernel.GetProcessTimes(handle, *(ctypes.byref(value) for value in values)):
            return None
        return (values[0].dwHighDateTime << 32) | values[0].dwLowDateTime
    finally:
        kernel.CloseHandle(handle)


def cleanup():
    if not STATE.exists():
        return
    state = json.loads(STATE.read_text(encoding="utf-8"))
    data = Path(state["pgdata"]).resolve()
    if not data.is_relative_to(STATE_ROOT.resolve()) or data.name != "pgdata":
        raise RuntimeError("Refusing cleanup outside the owned Jenkins database directory")
    fixture = Path(state["fixture"]).resolve()
    if fixture != data.parent / "flutter-fixture.json":
        raise RuntimeError("Refusing cleanup of an unowned credential fixture")
    for process in reversed(state.get("processes", [])):
        if process["born"] is not None and process_birth(process["pid"]) == process["born"]:
            subprocess.run(["taskkill.exe", "/PID", str(process["pid"]), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=30)
            deadline = time.monotonic() + 10
            while process_birth(process["pid"]) == process["born"] and time.monotonic() < deadline:
                time.sleep(0.1)
            if process_birth(process["pid"]) == process["born"]:
                raise RuntimeError("Owned process did not stop; preserving fixture state for cleanup retry")
    for process in PROCESSES:
        process.wait(timeout=30)
    for handle in HANDLES:
        handle.close()
    if (data / "postmaster.pid").exists():
        run([PG / "pg_ctl.exe", "-D", data, "-m", "fast", "-w", "stop"], ROOT, "postgres-stop")
    fixture.unlink(missing_ok=True)
    STATE.unlink()
    print("Owned fixtures stopped; credential fixture removed.", flush=True)


def start(args, cwd, name):
    output = (EVIDENCE / (name + ".log")).open("w", encoding="utf-8")
    HANDLES.append(output)
    process = subprocess.Popen([str(a) for a in args], cwd=cwd, env=ENV,
                               stdout=output, stderr=subprocess.STDOUT,
                               creationflags=subprocess.CREATE_NO_WINDOW)
    PROCESSES.append(process)
    state = json.loads(STATE.read_text(encoding="utf-8"))
    state.setdefault("processes", []).append({"pid": process.pid, "born": process_birth(process.pid)})
    save(state)


def ready(url):
    try:
        with urlopen(url, timeout=2) as response:
            return response.status == 200
    except Exception:
        return False


def docker_environment():
    """Keep Linux Docker gates on the configured WSL host, without a public API."""
    distro = os.environ.get("GARAGEOS_DOCKER_WSL_DISTRO")
    if distro:
        prefix = ["wsl.exe", "--distribution", distro, "--exec"]
        probe = [*prefix, "/usr/bin/docker", "info"]
        try:
            started = subprocess.run(["wsl.exe", "--distribution", distro, "--user", "root", "--exec",
                                      "/usr/bin/systemctl", "start", "docker"],
                                     capture_output=True, timeout=30)
            if started.returncode:
                print("LIMIT: Configured WSL Docker service did not start.", flush=True)
                return prefix, False
        except (OSError, subprocess.TimeoutExpired):
            return prefix, False
    else:
        prefix = []
        executable = shutil.which("docker")
        probe = [executable, "info"] if executable else []
    # WSL may need a moment to boot systemd/Docker on the first invocation.
    for attempt in range(6 if distro else 1):
        try:
            if probe and subprocess.run(probe, capture_output=True, timeout=30).returncode == 0:
                return prefix, True
        except (OSError, subprocess.TimeoutExpired):
            pass
        if distro and attempt < 5:
            time.sleep(2)
    return prefix, False


def docker_gate(prefix, script, name):
    path = ROOT / "garageos/scripts" / script
    if prefix:
        # The daemon and bind-mounted fixture files must use the same Linux paths.
        linux_path = subprocess.check_output([*prefix, "/usr/bin/wslpath", "-u", str(path)],
                                             text=True, encoding="utf-8", timeout=30).strip()
        command = [*prefix, "/usr/bin/python3", linux_path]
    else:
        command = [sys.executable, path]
    run(command, ROOT, name)


def main(allow_missing_docker):
    if os.name != "nt" or ROOT.name != "checkout":
        raise RuntimeError("Run only from an isolated Windows Jenkins checkout directory")
    if not ROOT.is_relative_to(WORKSPACE) or not os.environ.get("BUILD_NUMBER"):
        raise RuntimeError("Jenkins WORKSPACE and BUILD_NUMBER are required")
    for port in (55444, 8010, 3001):
        with socket.socket() as check:
            if check.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError(f"Refusing to use occupied fixture port {port}")
    if STATE.exists():
        raise RuntimeError("Prior owned fixture state needs --cleanup-only before a new build")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    docker_prefix, available = docker_environment()
    missing = not available
    if missing and not allow_missing_docker:
        raise RuntimeError("Docker Linux engine is required for production transport gates")
    if missing:
        (EVIDENCE / "unavailable-gates.txt").write_text("NOT RUN: Docker production routing and dashboard build-context gates.\n", encoding="utf-8")
        print("LIMIT: Docker transport gates unavailable; result cannot be SUCCESS.", flush=True)
    else:
        docker_gate(docker_prefix, "test_dashboard_build_context.py", "build-context")
        docker_gate(docker_prefix, "test_public_routing.py", "public-routing")
    run([sys.executable, "-m", "venv", PYTHON.parent.parent], ROOT, "python-environment")
    run([PYTHON, "-m", "pip", "install", "--upgrade", "pip==26.2.1"], BACKEND, "backend-installer")
    run([PYTHON, "-m", "pip", "install", "-r", "requirements-dev.txt"], BACKEND, "backend-dependencies")
    run([PYTHON, "-m", "pip", "check"], BACKEND, "backend-dependency-check")
    run([sys.executable, "-m", "venv", AUDITOR.parent.parent], ROOT, "audit-environment")
    run([AUDITOR, "-m", "pip", "install", "--upgrade", "pip==26.2.1", "pip-audit==2.10.1"], ROOT, "audit-tool")
    run([sys.executable, ROOT / "garageos/scripts/audit_python_environment.py", "--python", PYTHON,
         "--auditor", AUDITOR, "--output", EVIDENCE], ROOT, "backend-audit")
    run(["npm.cmd", "ci"], ROOT / "garageos", "node-dependencies")
    run(["npm.cmd", "audit", "--json"], ROOT / "garageos", "node-audit")
    run(["npm.cmd", "audit", "--omit=dev", "--json"], ROOT / "garageos", "node-production-audit")
    run(["npm.cmd", "run", "check:next-root-glob"], DASHBOARD, "next-root-glob")
    version = subprocess.check_output([str(FLUTTER), "--version", "--machine"], env=ENV, text=True, encoding="utf-8")
    if json.loads(version)["frameworkVersion"] != "3.47.6":
        raise RuntimeError("Expected Flutter3.47.6; update the local pinned SDK before building")
    data = STATE_ROOT / os.environ["BUILD_NUMBER"] / "pgdata"
    fixture = data.parent / "flutter-fixture.json"
    data.parent.mkdir(parents=True, exist_ok=False)
    save({"pgdata": str(data), "fixture": str(fixture)})
    try:
        run([PG / "initdb.exe", "-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"], ROOT, "postgres-init")
        run([PG / "pg_ctl.exe", "-D", data, "-l", EVIDENCE / "postgres.log", "-o", "-p 55444 -h 127.0.0.1", "-w", "start"], ROOT, "postgres-start")
        run([PG / "createdb.exe", "-h", "127.0.0.1", "-p", "55444", "-U", "postgres", "garage_test"], ROOT, "postgres-database")
        run([PYTHON, "-m", "alembic", "upgrade", "head"], BACKEND, "migrations")
        run([PYTHON, "-m", "alembic", "check"], BACKEND, "schema")
        run([PYTHON, "-m", "pytest", "tests/test_service_work_api.py", "-q"], BACKEND, "preseed-api")
        run([PYTHON, "-m", "app.seeds.demo", "--fresh"], BACKEND, "demo-seed")
        run([PYTHON, "-m", "pytest", "-q", "--junitxml=" + str(EVIDENCE / "backend.xml")], BACKEND, "backend-tests")
        for command, name in ((["npx.cmd", "tsc", "--noEmit"], "typecheck"),
                              (["npm.cmd", "run", "i18n:check"], "browser-locales"),
                              (["npm.cmd", "run", "i18n:audit"], "browser-i18n-audit"),
                              (["npm.cmd", "run", "lint"], "lint"),
                              (["npm.cmd", "run", "build"], "dashboard-build")):
            run(command, DASHBOARD, name)
        run([FLUTTER, "pub", "get"], APP, "flutter-dependencies")
        dart = FLUTTER.parent / "cache/dart-sdk/bin/dart.exe"
        run([dart, "run", "tool/check_l10n.dart"], APP, "flutter-locales")
        run([FLUTTER, "gen-l10n"], APP, "flutter-generate-locales")
        run([FLUTTER, "analyze"], APP, "flutter-analyze")
        run([PYTHON, "-m", "tests.support.platform_browser"], BACKEND, "platform-fixture")
        run([PYTHON, APP / "tool/seed_api_smoke.py", fixture], BACKEND, "flutter-fixture")
        run(["npx.cmd", "playwright", "install", "chromium"], DASHBOARD, "browser-runtime")
        start([PYTHON, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010"], BACKEND, "api")
        start(["node.exe", ROOT / "garageos/node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3001"], DASHBOARD, "dashboard")
        for _ in range(90):
            if any(p.poll() is not None for p in PROCESSES):
                raise RuntimeError("An owned API/dashboard process exited")
            if ready("http://127.0.0.1:8010/health") and ready("http://127.0.0.1:3001/healthz"):
                break
            time.sleep(1)
        else:
            raise RuntimeError("API/dashboard readiness timed out")
        run([FLUTTER, "test", "--reporter", "expanded", "--dart-define=RUN_LIVE_API=true",
             "--dart-define=API_URL=http://127.0.0.1:8010/api/v1", "--dart-define=SMOKE_FIXTURE=" + str(fixture)], APP, "flutter-tests-live")
        run([FLUTTER, "build", "web", "--release", "--no-web-resources-cdn"], APP, "flutter-web")
        run(["npx.cmd", "playwright", "test", "e2e/staff-accounts.spec.ts", "e2e/service-work-invoice.spec.ts",
             "e2e/platform.spec.ts", "e2e/theme-compat.spec.ts", "--reporter=list"], DASHBOARD, "browser-tests")
        shutil.make_archive(str(EVIDENCE / "flutter-web"), "zip", APP / "build/web")
        if (DASHBOARD / "test-results").exists():
            shutil.copytree(DASHBOARD / "test-results", EVIDENCE / "browser-results", dirs_exist_ok=True)
        revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        (EVIDENCE / "result.json").write_text(json.dumps({"sha": revision, "docker_gates": "unavailable" if missing else "passed", "application_gates": "passed",
            "docker_environment": "WSL " + os.environ["GARAGEOS_DOCKER_WSL_DISTRO"] if docker_prefix else "Windows Docker context"}, indent=2), encoding="utf-8")
        return 3 if missing else 0
    finally:
        cleanup()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-missing-docker", action="store_true")
    parser.add_argument("--cleanup-only", action="store_true")
    args = parser.parse_args()
    if args.cleanup_only:
        cleanup()
    else:
        sys.exit(main(args.allow_missing_docker))
