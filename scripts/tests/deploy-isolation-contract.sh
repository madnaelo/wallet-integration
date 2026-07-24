#!/usr/bin/env bash
# Literal fragments below are assertions against deployment source files.
# shellcheck disable=SC2016
set -euo pipefail

deploy_script="scripts/deploy/deploy-oci-backend.sh"
release_workflow=".github/workflows/release-production.yml"

bash -n "$deploy_script"

grep -Fq 'backend_memory="${BACKEND_MEMORY:-448m}"' "$deploy_script"
grep -Fq 'backend_memory_swap="${BACKEND_MEMORY_SWAP:-768m}"' "$deploy_script"
grep -Fq 'postgres_memory="${POSTGRES_MEMORY:-224m}"' "$deploy_script"
grep -Fq 'postgres_memory_swap="${POSTGRES_MEMORY_SWAP:-384m}"' "$deploy_script"
grep -Fq 'Caddy-sites' "$deploy_script"
grep -Fq 'run_container exec "$caddy_container" curl' "$deploy_script"
grep -Fq 'fetch_backend_health' "$deploy_script"
grep -Fq 'cp "$caddy_site_backup" "$caddy_site_path"' "$deploy_script"
grep -Fq 'COHOSTED_HEALTH_URLS=' "$release_workflow"
grep -Fq 'COHOSTED_HEALTH_URL:' "$release_workflow"

if grep -Eq 'run_container[[:space:]]+(stop|rm)[^#\n]*"\$caddy_container"' "$deploy_script"; then
  echo "Wallet deployment must reload, never stop or replace, shared Caddy." >&2
  exit 1
fi
if grep -Eq '(docker|podman)[[:space:]]+(system|image|builder|volume|network)[[:space:]]+prune' "$deploy_script"; then
  echo "Wallet deployment must not prune host-wide resources." >&2
  exit 1
fi
postgres_stop_count="$(grep -cF 'run_container stop --time 30 "$postgres_container"' "$deploy_script" || true)"
postgres_hardening_guard_line="$(grep -nF 'if [ "$postgres_needs_recreate" = "true" ]; then' "$deploy_script" | head -n 1 | cut -d: -f1)"
postgres_stop_line="$(grep -nF 'run_container stop --time 30 "$postgres_container"' "$deploy_script" | head -n 1 | cut -d: -f1)"
if [ "$postgres_stop_count" -ne 1 ] || (( postgres_stop_line <= postgres_hardening_guard_line )); then
  echo "PostgreSQL may stop only inside the guarded one-time hardening migration." >&2
  exit 1
fi

site_restore_line="$(grep -nF 'cp "$caddy_site_backup" "$caddy_site_path"' "$deploy_script" | head -n 1 | cut -d: -f1)"
rollback_reload_line="$(grep -nF 'run_container exec "$caddy_container" caddy reload' "$deploy_script" | tail -n 1 | cut -d: -f1)"
if (( site_restore_line >= rollback_reload_line )); then
  echo "Rollback must restore the Wallet site fragment before reloading Caddy." >&2
  exit 1
fi

echo "Wallet cohosted deployment contract passed."
