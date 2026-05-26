#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

compose_file="${COMPOSE_FILE:-docker-compose.oci-backend.yml}"
env_file="${DEPLOY_ENV_FILE:-infra/oci-backend.env}"
health_url="${BACKEND_HEALTH_URL:-}"

if [ ! -f "$compose_file" ]; then
  echo "Missing compose file: $compose_file" >&2
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "Missing backend env file: $env_file" >&2
  exit 1
fi

if [ -z "${BACKEND_IMAGE:-}" ]; then
  echo "BACKEND_IMAGE is required." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed on this host." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not available on this host." >&2
  exit 1
fi

if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
fi

export BACKEND_IMAGE

docker compose --env-file "$env_file" -f "$compose_file" pull postgres caddy backend
docker compose --env-file "$env_file" -f "$compose_file" up -d --remove-orphans
docker compose --env-file "$env_file" -f "$compose_file" ps

if [ -z "$health_url" ]; then
  api_domain="$(grep -E '^API_DOMAIN=' "$env_file" | tail -n 1 | cut -d= -f2-)"
  if [ -n "$api_domain" ]; then
    health_url="https://${api_domain}/api/health"
  fi
fi

if [ -n "$health_url" ] && command -v curl >/dev/null 2>&1; then
  echo "Waiting for backend health: $health_url"
  for attempt in $(seq 1 30); do
    if curl -fsS "$health_url" >/dev/null; then
      echo "Backend is healthy."
      break
    fi
    if [ "$attempt" = "30" ]; then
      echo "Backend health check failed." >&2
      docker compose --env-file "$env_file" -f "$compose_file" logs --tail=120 backend >&2
      exit 1
    fi
    sleep 5
  done
fi

if [ "${PRUNE_OLD_IMAGES:-false}" = "true" ]; then
  docker image prune -f --filter "until=168h" >/dev/null
fi
