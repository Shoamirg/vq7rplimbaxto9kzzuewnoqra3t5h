"""Audit every distribution in a target interpreter, using an isolated auditor.

The complete pip inventory includes bootstrap/test tools. --no-deps audits those
exact installed versions; it does not exclude transitive dependencies. Preserve
pip-audit's nonzero result and reject skipped or missing distributions.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess


def canonical(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", required=True)
    parser.add_argument("--auditor", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    installed = json.loads(subprocess.check_output(
        [args.python, "-m", "pip", "list", "--format=json"], text=True, encoding="utf-8",
    ))
    if not installed:
        raise RuntimeError("Target environment has no installed distributions")
    (args.output / "backend-installed.json").write_text(json.dumps(installed, indent=2), encoding="utf-8")
    frozen = args.output / "backend-installed.txt"
    frozen.write_text("".join(f"{p['name']}=={p['version']}\n" for p in installed), encoding="utf-8")
    report = args.output / "backend-audit.json"
    result = subprocess.run([
        args.auditor, "-m", "pip_audit", "--strict", "--no-deps", "--disable-pip",
        "--progress-spinner", "off", "--format", "json", "--vulnerability-service", "pypi",
        "-r", str(frozen), "-o", str(report),
    ])
    # A collection/network failure may not produce a JSON report.
    if not report.is_file():
        return result.returncode or 2
    dependencies = json.loads(report.read_text(encoding="utf-8"))["dependencies"]
    expected = {(canonical(p["name"]), p["version"]) for p in installed}
    actual = {(canonical(p["name"]), p["version"]) for p in dependencies}
    skipped = [p["name"] for p in dependencies if p.get("skip_reason")]
    complete = expected == actual and len(installed) == len(expected) == len(dependencies) and not skipped
    records = sum(len(p.get("vulns", [])) for p in dependencies)
    unique = {(canonical(p["name"]), v["id"]) for p in dependencies for v in p.get("vulns", [])}
    summary = {"installed": len(installed), "audited": len(dependencies), "skipped": skipped,
               "coverage_complete": complete, "advisory_records": records,
               "unique_package_advisories": len(unique), "auditor_exit_code": result.returncode}
    (args.output / "backend-audit-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary), flush=True)
    if not complete:
        return 2
    return result.returncode or (1 if records else 0)


if __name__ == "__main__":
    raise SystemExit(main())
