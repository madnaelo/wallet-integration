#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

environment="${VERCEL_ENVIRONMENT:-production}"
prod_flag=()
if [ "$environment" = "production" ]; then
  prod_flag=(--prod)
fi

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN is required." >&2
  exit 1
fi

if [ -z "${VERCEL_ORG_ID:-}" ] || [ -z "${VERCEL_PROJECT_ID:-}" ]; then
  echo "VERCEL_ORG_ID and VERCEL_PROJECT_ID are required." >&2
  exit 1
fi

export NEXT_TELEMETRY_DISABLED=1
export VERCEL_TELEMETRY_DISABLED=1

npx --yes vercel@latest pull --yes --environment="$environment" --token "$VERCEL_TOKEN"
npx --yes vercel@latest build "${prod_flag[@]}" --token "$VERCEL_TOKEN"
npx --yes vercel@latest deploy --prebuilt "${prod_flag[@]}" --token "$VERCEL_TOKEN"
