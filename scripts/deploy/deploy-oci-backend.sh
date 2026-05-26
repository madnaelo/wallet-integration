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

run_container pull "$BACKEND_IMAGE" >/dev/null
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
  if ! sudo grep -qF "$marker" "$caddyfile_path"; then
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
