#!/usr/bin/env bash
# Restore-test: prove a backup can actually be restored.
#
# A backup you have never restored is a hope, not a backup. This restores the
# latest (or a given) dump into a THROWAWAY Postgres container — never touching
# the production database — then asserts the schema and core tables came back
# with data. Exits non-zero on any failure so it can run from cron and alert.
#
# Usage:
#   ./scripts/restore-test.sh                       # newest backup in ./backups
#   ./scripts/restore-test.sh backups/garageos-YYYYMMDD-HHMMSS.sql.gz
#
# Cron example (weekly, after nightly backups):
#   30 3 * * 0  cd /opt/garageos && ./scripts/restore-test.sh >> /var/log/garageos-restore-test.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"    # match docker-compose.prod.yml
CONTAINER="garageos-restore-test-$$"
TEST_DB="restore_verify"
TEST_USER="verify"
TEST_PASS="verify"

# Core tables that must exist and (mostly) contain rows after a real restore.
REQUIRED_TABLES=(service_centers users customers vehicles appointments invoices)

# --- pick the backup file -----------------------------------------------------
BACKUP_FILE="${1:-}"
if [[ -z "${BACKUP_FILE}" ]]; then
  BACKUP_FILE="$(ls -1t "${BACKUP_DIR}"/garageos-*.sql.gz 2>/dev/null | head -n1 || true)"
fi
if [[ -z "${BACKUP_FILE}" || ! -f "${BACKUP_FILE}" ]]; then
  echo "[restore-test] FAIL: no backup file found (looked in ${BACKUP_DIR})" >&2
  exit 1
fi
echo "[restore-test] verifying: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# --- ephemeral postgres -------------------------------------------------------
cleanup() { docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[restore-test] starting throwaway ${PG_IMAGE} (${CONTAINER})"
docker run -d --rm --name "${CONTAINER}" \
  -e POSTGRES_USER="${TEST_USER}" \
  -e POSTGRES_PASSWORD="${TEST_PASS}" \
  -e POSTGRES_DB="${TEST_DB}" \
  "${PG_IMAGE}" >/dev/null

echo -n "[restore-test] waiting for readiness"
for _ in $(seq 1 30); do
  if docker exec "${CONTAINER}" pg_isready -U "${TEST_USER}" -d "${TEST_DB}" >/dev/null 2>&1; then
    ready=1; break
  fi
  echo -n "."; sleep 1
done
echo
if [[ "${ready:-0}" != "1" ]]; then
  echo "[restore-test] FAIL: database did not become ready" >&2
  exit 1
fi

# --- restore ------------------------------------------------------------------
echo "[restore-test] restoring dump…"
if ! gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
      psql -v ON_ERROR_STOP=1 -q -U "${TEST_USER}" -d "${TEST_DB}" >/dev/null; then
  echo "[restore-test] FAIL: psql restore reported errors" >&2
  exit 1
fi

q() { docker exec "${CONTAINER}" psql -tA -U "${TEST_USER}" -d "${TEST_DB}" -c "$1"; }

# --- assertions ---------------------------------------------------------------
failures=0
echo "[restore-test] checking core tables:"
for tbl in "${REQUIRED_TABLES[@]}"; do
  exists="$(q "SELECT to_regclass('public.${tbl}') IS NOT NULL;")"
  if [[ "${exists}" != "t" ]]; then
    echo "  ✗ ${tbl}: MISSING"; failures=$((failures + 1)); continue
  fi
  rows="$(q "SELECT count(*) FROM ${tbl};")"
  # service_centers with zero rows means an empty/garbage dump — treat as failure.
  if [[ "${tbl}" == "service_centers" && "${rows}" == "0" ]]; then
    echo "  ✗ ${tbl}: 0 rows (empty restore?)"; failures=$((failures + 1)); continue
  fi
  echo "  ✓ ${tbl}: ${rows} rows"
done

if [[ "${failures}" -ne 0 ]]; then
  echo "[restore-test] FAIL: ${failures} check(s) failed" >&2
  exit 1
fi
echo "[restore-test] PASS: backup restores cleanly with data."
