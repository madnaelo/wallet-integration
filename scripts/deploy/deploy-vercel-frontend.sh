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

npx --yes "vercel@$vercel_cli_version" pull --yes --environment="$environment" --token "$VERCEL_TOKEN"
node <<'NODE'
const fs = require("node:fs");
const project = JSON.parse(fs.readFileSync(".vercel/project.json", "utf8"));
if (project.orgId !== process.env.VERCEL_ORG_ID || project.projectId !== process.env.VERCEL_PROJECT_ID) {
  throw new Error("Vercel pull linked a different organization or project.");
}
NODE

npx --yes "vercel@$vercel_cli_version" build "${prod_flag[@]}" --token "$VERCEL_TOKEN"
deployment_url="$(npx --yes "vercel@$vercel_cli_version" deploy --yes --prebuilt "${prod_flag[@]}" --token "$VERCEL_TOKEN" | tail -n 1 | tr -d '\r')"
if ! [[ "$deployment_url" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
  echo "Vercel did not return a valid deployment URL." >&2
  exit 1
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "deployment_url=$deployment_url" >> "$GITHUB_OUTPUT"
fi
echo "Frontend deployed to $deployment_url"
