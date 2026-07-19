#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /absolute/path/to/wallet-postgres-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 2
fi

backup_file="$1"
if [ ! -f "$backup_file" ] || [ -L "$backup_file" ]; then
  echo "Backup must be a regular, non-symlink file: $backup_file" >&2
  exit 1
fi

backup_dir="$(cd "$(dirname "$backup_file")" && pwd -P)"
backup_name="$(basename "$backup_file")"
backup_file="$backup_dir/$backup_name"
checksum_file="$backup_file.sha256"
postgres_image="${POSTGRES_IMAGE:-docker.io/library/postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777}"

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
  for candidate in docker podman; do
    if command -v "$candidate" >/dev/null 2>&1; then
      engine="$candidate"
      break
    fi
  done
fi
if [ -z "$engine" ]; then
  echo "Docker or Podman is required for the isolated restore drill." >&2
  exit 1
fi

run_container() {
  if [ "$(id -u)" -eq 0 ]; then
    "$engine" "$@"
  else
    sudo "$engine" "$@"
  fi
}

if [ ! -f "$checksum_file" ] || [ -L "$checksum_file" ]; then
  echo "Backup checksum file is required: $checksum_file" >&2
  exit 1
fi
expected_checksum="$(
  awk -v expected_name="$backup_name" '
    NR == 1 {
      value = $1
      name = $2
      sub(/^\*/, "", name)
    }
    NR > 1 { extra = 1 }
    END {
      if (extra || value !~ /^[0-9a-fA-F]{64}$/ || name != expected_name) exit 1
      print tolower(value)
    }
  ' "$checksum_file"
)" || {
  echo "Backup checksum file is invalid." >&2
  exit 1
}
actual_checksum="$(sha256sum "$backup_file" | awk '{ print $1 }')"
if [ "$actual_checksum" != "$expected_checksum" ]; then
  echo "Backup checksum verification failed." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
resource_suffix="$timestamp-$$"
container_name="swap-assistant-restore-$resource_suffix"
volume_name="swap-assistant-restore-$resource_suffix"
restore_password="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"

cleanup() {
  run_container rm -f "$container_name" >/dev/null 2>&1 || true
  run_container volume rm "$volume_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if run_container container inspect "$container_name" >/dev/null 2>&1 \
  || run_container volume inspect "$volume_name" >/dev/null 2>&1; then
  echo "Temporary restore resource already exists; retry the drill." >&2
  exit 1
fi

run_container pull "$postgres_image" >/dev/null
run_container volume create \
  --label com.swapassistant.app=backend \
  --label com.swapassistant.role=restore-drill \
  "$volume_name" >/dev/null

run_container run -d \
  --name "$container_name" \
  --label com.swapassistant.app=backend \
  --label com.swapassistant.role=restore-drill \
  --network none \
  --mount "type=volume,source=$volume_name,target=/var/lib/postgresql/data" \
  --memory "2g" \
  --cpus "2" \
  --pids-limit 256 \
  -e POSTGRES_DB=wallet_restore \
  -e POSTGRES_USER=wallet_restore \
  -e "POSTGRES_PASSWORD=$restore_password" \
  "$postgres_image" >/dev/null

ready=false
for attempt in $(seq 1 60); do
  if readiness="$(
    run_container exec "$container_name" \
      psql -U wallet_restore -d wallet_restore -Atq \
      -v ON_ERROR_STOP=1 \
      -c "SELECT 1;" 2>/dev/null
  )" && [ "$readiness" = "1" ]; then
    ready=true
    break
  fi
  if [ "$attempt" = "60" ]; then
    run_container logs --tail=120 "$container_name" >&2 || true
  else
    sleep 2
  fi
done
if [ "$ready" != "true" ]; then
  echo "Temporary PostgreSQL did not become ready." >&2
  exit 1
fi

run_container exec -i "$container_name" \
  pg_restore \
  -U wallet_restore \
  -d wallet_restore \
  --no-owner \
  --no-privileges \
  --exit-on-error < "$backup_file"

required_tables=(
  flyway_schema_history
  wallet_users
  swap_history
  notification_preferences
  favorite_pairs
  push_subscriptions
  limit_orders
)
for table in "${required_tables[@]}"; do
  exists="$(
    run_container exec "$container_name" \
      psql -U wallet_restore -d wallet_restore -Atq \
      -v ON_ERROR_STOP=1 \
      -c "SELECT to_regclass('public.$table') IS NOT NULL;"
  )"
  if [ "$exists" != "t" ]; then
    echo "Restored backup is missing required table: $table" >&2
    exit 1
  fi
done

echo "Restore drill passed in an isolated temporary database: $backup_name"
