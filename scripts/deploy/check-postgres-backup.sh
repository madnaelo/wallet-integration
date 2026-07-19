#!/usr/bin/env bash
set -Eeuo pipefail

run_restore=false
if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [--restore]" >&2
  exit 2
fi
if [ "$#" -eq 1 ]; then
  if [ "$1" != "--restore" ]; then
    echo "Usage: $0 [--restore]" >&2
    exit 2
  fi
  run_restore=true
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this backup health check as root (for example, with sudo)." >&2
  exit 1
fi

deploy_path="${OCI_DEPLOY_PATH:-/home/opc/wallet}"
env_file="${DEPLOY_ENV_FILE:-$deploy_path/backend.env}"
postgres_container="${POSTGRES_CONTAINER_NAME:-wallet-postgres}"
max_age_hours="${BACKUP_MAX_AGE_HOURS:-30}"
restore_script="${RESTORE_SCRIPT:-/usr/local/bin/swap-assistant-postgres-restore-check}"

if ! [[ "$max_age_hours" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_MAX_AGE_HOURS must be a positive integer." >&2
  exit 1
fi
if [ ! -f "$env_file" ] || [ -L "$env_file" ]; then
  echo "Missing regular backend env file: $env_file" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -v key="$key" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      sub(/\r$/, "", value)
      found = 1
    }
    END {
      if (!found) exit 1
      print value
    }
  ' "$env_file"
}

configured_backup_dir="$(read_env_value BACKUP_DIR || true)"
backup_dir="${BACKUP_DIR:-${configured_backup_dir:-$deploy_path/backups/postgres}}"
backup_bucket="${OCI_BACKUP_BUCKET:-$(read_env_value OCI_BACKUP_BUCKET || true)}"
backup_namespace="${OCI_BACKUP_NAMESPACE:-$(read_env_value OCI_BACKUP_NAMESPACE || true)}"

if [ -z "$backup_bucket" ] || [ -z "$backup_namespace" ]; then
  echo "Offsite backup bucket and namespace must be configured." >&2
  exit 1
fi
if [ ! -d "$backup_dir" ] || [ -L "$backup_dir" ]; then
  echo "Backup directory is missing or is a symbolic link: $backup_dir" >&2
  exit 1
fi

backup_dir="$(cd "$backup_dir" && pwd -P)"
directory_mode="$(stat -c '%a' "$backup_dir")"
if (( (8#$directory_mode & 077) != 0 )); then
  echo "Backup directory permissions are too broad: $directory_mode" >&2
  exit 1
fi

latest_backup=""
latest_backup_epoch=-1
shopt -s nullglob
for candidate_backup in "$backup_dir"/wallet-postgres-*.dump; do
  if [ ! -f "$candidate_backup" ] || [ -L "$candidate_backup" ]; then
    continue
  fi
  candidate_epoch="$(stat -c '%Y' "$candidate_backup")"
  if [ "$candidate_epoch" -gt "$latest_backup_epoch" ]; then
    latest_backup="$candidate_backup"
    latest_backup_epoch="$candidate_epoch"
  fi
done
shopt -u nullglob
if [ -z "$latest_backup" ]; then
  echo "No PostgreSQL backup was found in $backup_dir." >&2
  exit 1
fi
backup_name="$(basename "$latest_backup")"
checksum_file="$latest_backup.sha256"

if [ "$(cd "$(dirname "$latest_backup")" && pwd -P)" != "$backup_dir" ] \
  || [ ! -f "$latest_backup" ] || [ -L "$latest_backup" ]; then
  echo "Latest backup is not a regular file inside the configured directory." >&2
  exit 1
fi
if [ ! -f "$checksum_file" ] || [ -L "$checksum_file" ]; then
  echo "Latest backup has no regular checksum file: $backup_name" >&2
  exit 1
fi

backup_mode="$(stat -c '%a' "$latest_backup")"
checksum_mode="$(stat -c '%a' "$checksum_file")"
if (( (8#$backup_mode & 077) != 0 || (8#$checksum_mode & 077) != 0 )); then
  echo "Backup or checksum permissions are too broad." >&2
  exit 1
fi

expected_checksum="$(
  awk -v expected_name="$backup_name" '
    NR == 1 {
      hash = $1
      name = $2
      sub(/^\*/, "", name)
    }
    NR > 1 { extra = 1 }
    END {
      if (extra || hash !~ /^[0-9a-fA-F]{64}$/ || name != expected_name) exit 1
      print tolower(hash)
    }
  ' "$checksum_file"
)" || {
  echo "Latest backup checksum file is invalid." >&2
  exit 1
}
actual_checksum="$(sha256sum "$latest_backup" | awk '{ print $1 }')"
if [ "$actual_checksum" != "$expected_checksum" ]; then
  echo "Latest backup checksum verification failed." >&2
  exit 1
fi

now_epoch="$(date +%s)"
backup_epoch="$(stat -c '%Y' "$latest_backup")"
age_seconds="$((now_epoch - backup_epoch))"
if [ "$age_seconds" -lt -300 ]; then
  echo "Latest backup timestamp is unexpectedly in the future." >&2
  exit 1
fi
if [ "$age_seconds" -gt "$((max_age_hours * 3600))" ]; then
  echo "Latest PostgreSQL backup is older than $max_age_hours hours." >&2
  exit 1
fi

engine="${OCI_CONTAINER_ENGINE:-}"
if [ -n "$engine" ] && [ "$engine" != "docker" ] && [ "$engine" != "podman" ]; then
  echo "OCI_CONTAINER_ENGINE must be docker or podman." >&2
  exit 1
fi
if [ -n "$engine" ] && ! command -v "$engine" >/dev/null 2>&1; then
  echo "Configured container engine is not installed: $engine" >&2
  exit 1
fi
if [ -z "$engine" ]; then
  for candidate_engine in docker podman; do
    if command -v "$candidate_engine" >/dev/null 2>&1 \
      && "$candidate_engine" container inspect "$postgres_container" >/dev/null 2>&1; then
      engine="$candidate_engine"
      break
    fi
  done
fi
if [ -z "$engine" ]; then
  echo "Could not find the container engine that owns $postgres_container." >&2
  exit 1
fi
if [ "$("$engine" inspect -f '{{.State.Running}}' "$postgres_container" 2>/dev/null || true)" != "true" ]; then
  echo "PostgreSQL container is not running: $postgres_container" >&2
  exit 1
fi

"$engine" exec -i "$postgres_container" pg_restore --list < "$latest_backup" >/dev/null

if command -v systemctl >/dev/null 2>&1; then
  systemctl is-enabled --quiet wallet-postgres-backup.timer \
    || { echo "PostgreSQL backup timer is not enabled." >&2; exit 1; }
  systemctl is-active --quiet wallet-postgres-backup.timer \
    || { echo "PostgreSQL backup timer is not active." >&2; exit 1; }
  service_result="$(systemctl show wallet-postgres-backup.service --property=Result --value)"
  if [ "$service_result" != "success" ]; then
    echo "The most recent PostgreSQL backup service result is $service_result." >&2
    exit 1
  fi
fi

age_minutes="$(( age_seconds > 0 ? age_seconds / 60 : 0 ))"
echo "PostgreSQL backup is healthy: $backup_name (${age_minutes} minutes old)."

if [ "$run_restore" = "true" ]; then
  if [ ! -x "$restore_script" ] || [ -L "$restore_script" ]; then
    echo "Restore verifier is missing or unsafe: $restore_script" >&2
    exit 1
  fi
  OCI_CONTAINER_ENGINE="$engine" "$restore_script" "$latest_backup"
fi
