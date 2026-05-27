#!/usr/bin/env bash
set -Eeuo pipefail

deploy_path="${OCI_DEPLOY_PATH:-/home/opc/wallet}"
env_file="${DEPLOY_ENV_FILE:-$deploy_path/backend.env}"
postgres_container="${POSTGRES_CONTAINER_NAME:-wallet-postgres}"
backup_dir="${BACKUP_DIR:-$deploy_path/backups/postgres}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

if [ ! -f "$env_file" ]; then
  echo "Missing backend env file: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

if ! [[ "$retention_days" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
  exit 1
fi

if command -v podman >/dev/null 2>&1; then
  engine="podman"
elif command -v docker >/dev/null 2>&1; then
  engine="docker"
else
  echo "Neither podman nor docker is installed on this host." >&2
  exit 1
fi

run_container() {
  if [ "$(id -u)" -eq 0 ]; then
    "$engine" "$@"
  else
    sudo "$engine" "$@"
  fi
}

if ! run_container container exists "$postgres_container" >/dev/null 2>&1; then
  echo "Postgres container does not exist: $postgres_container" >&2
  exit 1
fi

if ! run_container inspect -f '{{.State.Running}}' "$postgres_container" 2>/dev/null | grep -qx true; then
  echo "Postgres container is not running: $postgres_container" >&2
  exit 1
fi

umask 077
mkdir -p "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/wallet-postgres-$timestamp.dump"
tmp_file="$backup_file.tmp"

cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

run_container exec "$postgres_container" sh -ceu '
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -U "${POSTGRES_USER:-wallet}" \
    -d "${POSTGRES_DB:-wallet}" \
    --format=custom \
    --no-owner \
    --no-privileges
' > "$tmp_file"

if [ ! -s "$tmp_file" ]; then
  echo "Backup file is empty." >&2
  exit 1
fi

if run_container exec "$postgres_container" sh -c 'command -v pg_restore >/dev/null 2>&1'; then
  run_container exec -i "$postgres_container" pg_restore --list < "$tmp_file" >/dev/null
fi

mv "$tmp_file" "$backup_file"
trap - EXIT

find "$backup_dir" -type f -name 'wallet-postgres-*.dump' -mtime +"$retention_days" -delete

echo "Postgres backup created: $backup_file"
