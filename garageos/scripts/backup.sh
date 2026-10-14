#!/usr/bin/env bash
# Nightly Postgres backup for the production stack. Keeps the last 14 days.
# Cron example (host):
#   0 3 * * *  cd /opt/garageos && ./scripts/backup.sh >> /var/log/garageos-backup.log 2>&1
set -euo pipefail
umask 077

ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# Environment files are Compose data, not shell programs. Read only identifiers;
# dotenv cannot replace coordinator paths/names or re-enable premature pruning.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DB_IDENTIFIERS="$("${GARAGEOS_PYTHON:-python3}" "${SCRIPT_DIR}/deployment_db_env.py" "${ENV_FILE}")"
read -r POSTGRES_USER POSTGRES_DB <<< "${DB_IDENTIFIERS}"
export POSTGRES_USER POSTGRES_DB
export GARAGEOS_ENV_FILE="${ENV_FILE}"

if [[ ! "${RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "[backup] FAIL: RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi
if [[ -n "${BACKUP_OUTPUT_NAME:-}" && ! "${BACKUP_OUTPUT_NAME}" =~ ^garageos-[[:alnum:]_-]+\.sql\.gz$ ]]; then
  echo "[backup] FAIL: BACKUP_OUTPUT_NAME must be a GarageOS archive basename" >&2
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
if [[ -n "${BACKUP_OUTPUT_NAME:-}" ]]; then
  OUT="${BACKUP_DIR}/${BACKUP_OUTPUT_NAME}"
fi
if [[ -e "${OUT}" || -L "${OUT}" ]]; then
  echo "[backup] FAIL: requested backup already exists; preserving it" >&2
  exit 1
fi

echo "[backup] dumping ${POSTGRES_DB} -> ${OUT}"
if ! "${COMPOSE[@]}" exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${TEMP_FILE}"; then
  echo "[backup] FAIL: dump failed; no completed backup was published" >&2
  exit 1
fi
if ! gzip -t "${TEMP_FILE}" || ! gzip -cd "${TEMP_FILE}" | awk 'END { exit (NR == 0) }'; then
  echo "[backup] FAIL: dump is empty or gzip validation failed" >&2
  exit 1
fi
# Same-directory hard link publishes atomically and cannot overwrite a backup
# if another run wins the name between the existence check and publication.
ln -- "${TEMP_FILE}" "${OUT}"
rm -f -- "${TEMP_FILE}"

# A coordinated off-host run prunes only after its verified remote copy.
if [[ "${BACKUP_DEFER_PRUNE:-0}" != 1 ]]; then
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'garageos-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
fi
echo "[backup] done ($(du -h "${OUT}" | cut -f1)). Kept last ${RETENTION_DAYS} days."

# production_ops.py backup adds verified off-host copying and a status receipt.
