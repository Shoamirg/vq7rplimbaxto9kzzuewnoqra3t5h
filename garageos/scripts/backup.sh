#!/usr/bin/env bash
# Nightly Postgres backup for the production stack. Keeps the last 14 days.
# Cron example (host):
#   0 3 * * *  cd /opt/garageos && ./scripts/backup.sh >> /var/log/garageos-backup.log 2>&1
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file ${ENV_FILE}"

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/garageos-${STAMP}.sql.gz"

echo "[backup] dumping ${POSTGRES_DB} -> ${OUT}"
${COMPOSE} exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${OUT}"

# Prune old backups.
find "${BACKUP_DIR}" -name 'garageos-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] done ($(du -h "${OUT}" | cut -f1)). Kept last ${RETENTION_DAYS} days."

# TODO (recommended): sync ${BACKUP_DIR} to off-host object storage (S3/R2)
#   e.g. aws s3 sync "${BACKUP_DIR}" "s3://${S3_BUCKET}/backups/"
