#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

deployment_mode="${VERCEL_DEPLOY_MODE:-production}"
vercel_cli_version="56.3.1"
vercel_cli=(npx --yes "vercel@$vercel_cli_version")
deployment_flags=()
case "$deployment_mode" in
  production)
    environment=production
    deployment_flags=(--prod)
    ;;
  staged-production)
    environment=production
    deployment_flags=(--prod --skip-domain)
    ;;
  preview)
    environment="${VERCEL_ENVIRONMENT:-preview}"
    ;;
  promote)
    environment=production
    ;;
  *)
    echo "VERCEL_DEPLOY_MODE must be production, staged-production, preview, or promote." >&2
    exit 1
    ;;
esac

export NEXT_TELEMETRY_DISABLED=1
export VERCEL_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-${GITHUB_SHA:-local}}"
if [ -z "${NEXT_PUBLIC_COMMIT_TIMESTAMP:-}" ]; then
  NEXT_PUBLIC_COMMIT_TIMESTAMP="$(git show -s --format=%cI HEAD 2>/dev/null || true)"
fi
export NEXT_PUBLIC_COMMIT_TIMESTAMP

missing=()
for name in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Missing required Vercel values: %s\n' "${missing[*]}" >&2
  exit 1
fi

reported_cli_version="$("${vercel_cli[@]}" --version | tail -n 1 | tr -d '\r')"
if [[ "$reported_cli_version" != *"$vercel_cli_version"* ]]; then
  echo "Expected Vercel CLI $vercel_cli_version, received: $reported_cli_version" >&2
  exit 1
fi

"${vercel_cli[@]}" pull --yes --environment="$environment" --token "$VERCEL_TOKEN"
node <<'NODE'
const fs = require("node:fs");
const project = JSON.parse(fs.readFileSync(".vercel/project.json", "utf8"));
if (project.orgId !== process.env.VERCEL_ORG_ID || project.projectId !== process.env.VERCEL_PROJECT_ID) {
  throw new Error("Vercel pull linked a different organization or project.");
}
NODE

if [ "$deployment_mode" = "promote" ]; then
  deployment_url="${VERCEL_PROMOTE_URL:-}"
  if ! [[ "$deployment_url" =~ ^https://[A-Za-z0-9.-]+[.]vercel[.]app$ ]]; then
    echo "VERCEL_PROMOTE_URL must be a Vercel deployment URL." >&2
    exit 1
  fi
  "${vercel_cli[@]}" promote "$deployment_url" \
    --yes \
    --timeout=5m \
    --token "$VERCEL_TOKEN"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "deployment_url=$deployment_url" >> "$GITHUB_OUTPUT"
  fi
  echo "Frontend promoted from $deployment_url"
  exit 0
fi

# Sensitive Vercel variables cannot be decrypted by `vercel pull`. Build on
# Vercel so those values remain server-side and are available to Next.js.
deployment_url="$("${vercel_cli[@]}" deploy \
  --yes \
  --force \
  --archive=tgz \
  "${deployment_flags[@]}" \
  --build-env "NEXT_TELEMETRY_DISABLED=1" \
  --build-env "NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION" \
  --build-env "NEXT_PUBLIC_COMMIT_TIMESTAMP=$NEXT_PUBLIC_COMMIT_TIMESTAMP" \
  --token "$VERCEL_TOKEN" \
  | tail -n 1 \
  | tr -d '\r')"
if ! [[ "$deployment_url" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
  echo "Vercel did not return a valid deployment URL." >&2
  exit 1
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "deployment_url=$deployment_url" >> "$GITHUB_OUTPUT"
fi
echo "Frontend deployed to $deployment_url"
