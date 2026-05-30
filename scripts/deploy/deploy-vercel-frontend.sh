#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

environment="${VERCEL_ENVIRONMENT:-production}"
vercel_cli_version="${VERCEL_CLI_VERSION:-54.5.0}"
prod_flag=()
if [ "$environment" = "production" ]; then
  prod_flag=(--prod)
fi

export NEXT_TELEMETRY_DISABLED=1
export VERCEL_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-${GITHUB_SHA:-local}}"
export NEXT_PUBLIC_APP_BRANCH="${NEXT_PUBLIC_APP_BRANCH:-${GITHUB_REF_NAME:-${VERCEL_GIT_COMMIT_REF:-local}}}"
export NEXT_PUBLIC_DEPLOYED_AT="${NEXT_PUBLIC_DEPLOYED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

if [ -n "${VERCEL_TOKEN:-}" ] && [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
  npx --yes "vercel@$vercel_cli_version" pull --yes --environment="$environment" --token "$VERCEL_TOKEN"
  npx --yes "vercel@$vercel_cli_version" build "${prod_flag[@]}" --token "$VERCEL_TOKEN"
  npx --yes "vercel@$vercel_cli_version" deploy --prebuilt "${prod_flag[@]}" --token "$VERCEL_TOKEN"
  exit 0
fi

if [ -n "${VERCEL_DEPLOY_HOOK_URL:-}" ]; then
  curl --fail --silent --show-error --retry 3 --request POST "$VERCEL_DEPLOY_HOOK_URL" >/dev/null
  echo "Triggered Vercel deployment through deploy hook."
  exit 0
fi

echo "Set VERCEL_TOKEN, VERCEL_ORG_ID, and VERCEL_PROJECT_ID for verified prebuilt deploys." >&2
echo "VERCEL_DEPLOY_HOOK_URL remains supported only as a fallback." >&2
exit 1
