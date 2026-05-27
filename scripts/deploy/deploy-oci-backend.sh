#!/usr/bin/env bash
set -Eeuo pipefail

deploy_path="${OCI_DEPLOY_PATH:-/home/opc/wallet}"
env_file="${DEPLOY_ENV_FILE:-$deploy_path/backend.env}"
container_network="${OCI_CONTAINER_NETWORK:-uk-property-check}"
backend_container="${BACKEND_CONTAINER_NAME:-wallet-backend}"
postgres_container="${POSTGRES_CONTAINER_NAME:-wallet-postgres}"
postgres_volume="${POSTGRES_VOLUME_NAME:-wallet-postgres-data}"
backend_memory="${BACKEND_MEMORY:-520m}"
api_domain="${WALLET_API_DOMAIN:-}"
caddyfile_path="${OCI_CADDYFILE_PATH:-/home/opc/uk-property-check-middleware/Caddyfile}"
caddy_container="${OCI_CADDY_CONTAINER:-uk-property-check-caddy}"

if [ -z "${BACKEND_IMAGE:-}" ]; then
  echo "BACKEND_IMAGE is required." >&2
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "Missing backend env file: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

if command -v podman >/dev/null 2>&1; then
  engine="podman"
elif command -v docker >/dev/null 2>&1; then
  engine="docker"
else
  echo "Neither podman nor docker is installed on this host." >&2
  exit 1
fi

run_container() {
  sudo "$engine" "$@"
}

if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | run_container login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
fi

if ! run_container network exists "$container_network" >/dev/null 2>&1; then
  run_container network create "$container_network" >/dev/null
fi

if ! run_container volume exists "$postgres_volume" >/dev/null 2>&1; then
  run_container volume create "$postgres_volume" >/dev/null
fi

if run_container container exists "$postgres_container" >/dev/null 2>&1; then
  run_container start "$postgres_container" >/dev/null
else
  run_container run -d \
    --name "$postgres_container" \
    --restart unless-stopped \
    --network "$container_network" \
    --env-file "$env_file" \
    -v "$postgres_volume:/var/lib/postgresql/data:Z" \
    docker.io/library/postgres:16-alpine >/dev/null
fi

for attempt in $(seq 1 60); do
  if run_container exec "$postgres_container" pg_isready -U "${POSTGRES_USER:-wallet}" -d "${POSTGRES_DB:-wallet}" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" = "60" ]; then
    run_container logs --tail=120 "$postgres_container" >&2
    exit 1
  fi
  sleep 2
done

if ! run_container image exists "$BACKEND_IMAGE" >/dev/null 2>&1; then
  run_container pull "$BACKEND_IMAGE" >/dev/null
fi
run_container rm -f "$backend_container" >/dev/null 2>&1 || true
run_container run -d \
  --name "$backend_container" \
  --restart unless-stopped \
  --network "$container_network" \
  --env-file "$env_file" \
  --memory "$backend_memory" \
  "$BACKEND_IMAGE" >/dev/null

for attempt in $(seq 1 90); do
  if run_container exec "$backend_container" wget -q -O - http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" = "90" ]; then
    run_container logs --tail=180 "$backend_container" >&2
    exit 1
  fi
  sleep 2
done

if [ -n "$api_domain" ] && [ -f "$caddyfile_path" ] && run_container container exists "$caddy_container" >/dev/null 2>&1; then
  marker="# wallet-backend:$api_domain"
  if ! sudo grep -qF "$marker" "$caddyfile_path" \
    && ! sudo grep -Eq "^[[:space:]]*$api_domain[[:space:]]*\\{" "$caddyfile_path"; then
    sudo cp "$caddyfile_path" "$caddyfile_path.bak-wallet-$(date +%Y%m%d%H%M%S)"
    {
      echo ""
      echo "$marker"
      echo "$api_domain {"
      echo "  encode zstd gzip"
      echo "  reverse_proxy $backend_container:8080"
      echo "}"
    } | sudo tee -a "$caddyfile_path" >/dev/null
  fi
  run_container exec "$caddy_container" caddy validate --config /etc/caddy/Caddyfile >/dev/null
  run_container exec "$caddy_container" caddy reload --config /etc/caddy/Caddyfile >/dev/null
fi

if [ "${ENABLE_POSTGRES_BACKUP_TIMER:-false}" = "true" ]; then
  backup_script="$deploy_path/scripts/deploy/backup-oci-postgres.sh"
  backup_service_template="$deploy_path/infra/systemd/wallet-postgres-backup.service"
  backup_timer_template="$deploy_path/infra/systemd/wallet-postgres-backup.timer"
  if [ ! -f "$backup_script" ] || [ ! -f "$backup_service_template" ] || [ ! -f "$backup_timer_template" ]; then
    echo "Backup timer requested, but backup assets were not uploaded." >&2
    exit 1
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "Backup timer requested, but systemctl is unavailable on this host." >&2
    exit 1
  fi

  chmod +x "$backup_script"
  escaped_deploy_path="$(printf '%s' "$deploy_path" | sed 's/[&|\\]/\\&/g')"
  sudo sed "s|__WALLET_DEPLOY_PATH__|$escaped_deploy_path|g" "$backup_service_template" \
    | sudo tee /etc/systemd/system/wallet-postgres-backup.service >/dev/null
  sudo cp "$backup_timer_template" /etc/systemd/system/wallet-postgres-backup.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now wallet-postgres-backup.timer >/dev/null
fi

health_url="${BACKEND_HEALTH_URL:-}"
if [ -z "$health_url" ] && [ -n "$api_domain" ]; then
  health_url="https://$api_domain/api/health"
fi

if [ -n "$health_url" ] && command -v curl >/dev/null 2>&1; then
  for attempt in $(seq 1 30); do
    if curl -fsS "$health_url" >/dev/null; then
      echo "Backend is healthy: $health_url"
      exit 0
    fi
    if [ "$attempt" = "30" ]; then
      run_container logs --tail=120 "$backend_container" >&2
      exit 1
    fi
    sleep 5
  done
fi

echo "Backend is healthy."
