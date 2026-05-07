#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f infra/prod.env ]; then
  echo "Missing infra/prod.env. Create it from infra/prod.env.example before deploying." >&2
  exit 1
fi

docker compose --env-file infra/prod.env -f docker-compose.prod.yml pull caddy postgres
docker compose --env-file infra/prod.env -f docker-compose.prod.yml up -d --build
docker compose --env-file infra/prod.env -f docker-compose.prod.yml ps
