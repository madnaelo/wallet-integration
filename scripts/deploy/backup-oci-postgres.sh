#!/usr/bin/env bash
set -Eeuo pipefail

deploy_path="${OCI_DEPLOY_PATH:-/home/opc/wallet}"
env_file="${DEPLOY_ENV_FILE:-$deploy_path/backend.env}"
postgres_container="${POSTGRES_CONTAINER_NAME:-wallet-postgres}"

if [ ! -f "$env_file" ]; then
  echo "Missing backend env file: $env_file" >&2
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
configured_retention_days="$(read_env_value BACKUP_RETENTION_DAYS || true)"
configured_bucket="$(read_env_value OCI_BACKUP_BUCKET || true)"
configured_namespace="$(read_env_value OCI_BACKUP_NAMESPACE || true)"
configured_prefix="$(read_env_value OCI_BACKUP_OBJECT_PREFIX || true)"
configured_auth="$(read_env_value OCI_BACKUP_AUTH_MODE || true)"
configured_kms_key="$(read_env_value OCI_BACKUP_KMS_KEY_ID || true)"

backup_dir="${BACKUP_DIR:-${configured_backup_dir:-$deploy_path/backups/postgres}}"
retention_days="${BACKUP_RETENTION_DAYS:-${configured_retention_days:-14}}"
backup_bucket="${OCI_BACKUP_BUCKET:-$configured_bucket}"
backup_namespace="${OCI_BACKUP_NAMESPACE:-$configured_namespace}"
object_prefix="${OCI_BACKUP_OBJECT_PREFIX:-${configured_prefix:-swap-assistant/postgres}}"
oci_auth_mode="${OCI_BACKUP_AUTH_MODE:-${configured_auth:-instance_principal}}"
kms_key_id="${OCI_BACKUP_KMS_KEY_ID:-$configured_kms_key}"

if ! [[ "$retention_days" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
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
    if ! command -v "$candidate_engine" >/dev/null 2>&1; then
      continue
    fi
    if { [ "$(id -u)" -eq 0 ] && "$candidate_engine" container inspect "$postgres_container" >/dev/null 2>&1; } \
      || { [ "$(id -u)" -ne 0 ] && sudo "$candidate_engine" container inspect "$postgres_container" >/dev/null 2>&1; }; then
      engine="$candidate_engine"
      break
    fi
  done
fi
if [ -z "$engine" ]; then
  echo "Could not find the Docker or Podman engine that owns $postgres_container." >&2
  exit 1
fi

run_container() {
  if [ "$(id -u)" -eq 0 ]; then
    "$engine" "$@"
  else
    sudo "$engine" "$@"
  fi
}

if ! run_container container inspect "$postgres_container" >/dev/null 2>&1; then
  echo "PostgreSQL container does not exist: $postgres_container" >&2
  exit 1
fi

if [ "$(run_container inspect -f '{{.State.Running}}' "$postgres_container" 2>/dev/null || true)" != "true" ]; then
  echo "PostgreSQL container is not running: $postgres_container" >&2
  exit 1
fi

umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$deploy_path/.wallet-postgres-backup.lock"
  if ! flock -n 9; then
    echo "Another PostgreSQL backup is already running." >&2
    exit 1
  fi
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="wallet-postgres-$timestamp.dump"
backup_file="$backup_dir/$backup_name"
checksum_file="$backup_file.sha256"
tmp_file="$backup_file.tmp"

cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

# Variables in this block intentionally expand inside the PostgreSQL container.
# shellcheck disable=SC2016
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

run_container exec -i "$postgres_container" pg_restore --list < "$tmp_file" >/dev/null

mv "$tmp_file" "$backup_file"
chmod 600 "$backup_file"
(
  cd "$backup_dir"
  sha256sum "$backup_name" > "$backup_name.sha256"
)
chmod 600 "$checksum_file"
trap - EXIT

if [ -n "$backup_bucket" ]; then
  if ! command -v oci >/dev/null 2>&1; then
    echo "OCI_BACKUP_BUCKET is configured, but the OCI CLI is not installed." >&2
    exit 1
  fi

  object_prefix="${object_prefix#/}"
  object_prefix="${object_prefix%/}"
  object_name="$object_prefix/$backup_name"
  checksum_object_name="$object_name.sha256"
  declare -a oci_args=(--auth "$oci_auth_mode")
  if [ -n "$backup_namespace" ]; then
    oci_args+=(--namespace "$backup_namespace")
  fi
  if [ -n "$kms_key_id" ]; then
    oci_args+=(--opc-sse-kms-key-id "$kms_key_id")
  fi

  oci os object put "${oci_args[@]}" \
    --bucket-name "$backup_bucket" \
    --name "$object_name" \
    --file "$backup_file" \
    --force >/dev/null
  oci os object put "${oci_args[@]}" \
    --bucket-name "$backup_bucket" \
    --name "$checksum_object_name" \
    --file "$checksum_file" \
    --force >/dev/null
  echo "Encrypted-at-rest backup uploaded to OCI Object Storage: $backup_bucket/$object_name"
fi

find "$backup_dir" -type f \
  \( -name 'wallet-postgres-*.dump' -o -name 'wallet-postgres-*.dump.sha256' \) \
  -mtime +"$retention_days" -delete

echo "PostgreSQL backup created and verified: $backup_file"
