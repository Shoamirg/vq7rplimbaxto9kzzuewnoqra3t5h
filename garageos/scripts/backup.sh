#!/usr/bin/env bash
# Nightly Postgres backup for the production stack. Keeps the last 14 days.
# Cron example (host):
#   0 3 * * *  cd /opt/garageos && ./scripts/backup.sh >> /var/log/garageos-backup.log 2>&1
set -euo pipefail
umask 077

ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

if [[ ! "${RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "[backup] FAIL: RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi
: "${POSTGRES_USER:?Set POSTGRES_USER in ENV_FILE}"
: "${POSTGRES_DB:?Set POSTGRES_DB in ENV_FILE}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "${ENV_FILE}")

mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TEMP_FILE="$(mktemp "${BACKUP_DIR}/.garageos-backup.XXXXXX")"
trap 'rm -f -- "${TEMP_FILE}"' EXIT
# A random suffix permits multiple backups within the same second.
OUT="${BACKUP_DIR}/garageos-${STAMP}-${TEMP_FILE##*.}.sql.gz"

echo "[backup] dumping ${POSTGRES_DB} -> ${OUT}"
if ! "${COMPOSE[@]}" exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${TEMP_FILE}"; then
  echo "[backup] FAIL: dump failed; no completed backup was published" >&2
  exit 1
fi
if ! gzip -t "${TEMP_FILE}" || ! gzip -cd "${TEMP_FILE}" | awk 'END { exit (NR == 0) }'; then
  echo "[backup] FAIL: dump is empty or gzip validation failed" >&2
  exit 1
fi
# Same-directory rename publishes the complete archive atomically.
mv -- "${TEMP_FILE}" "${OUT}"

# Prune old backups.
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'garageos-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] done ($(du -h "${OUT}" | cut -f1)). Kept last ${RETENTION_DAYS} days."

# TODO (recommended): sync ${BACKUP_DIR} to off-host object storage (S3/R2)
#   e.g. aws s3 sync "${BACKUP_DIR}" "s3://${S3_BUCKET}/backups/"
