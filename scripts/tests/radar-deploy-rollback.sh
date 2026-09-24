#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -f "$work"/wallet-market-radar "$work"/wallet-market-radar-rollback "$work"/backend.env "$work"/.radar-credentials "$work"/log; rmdir "$work"' EXIT
export work repo
export env_file="$work/backend.env" deploy_path="$work" database_host=127.0.0.1
export internal_network=wallet-test-database postgres_container=wallet-test-postgres postgres_user=fixture postgres_db=fixture
export git_commit=0000000000000000000000000000000000000000
export RADAR_IMAGE=ghcr.io/madnaelo/wallet-market-radar@sha256:0000000000000000000000000000000000000000000000000000000000000000
printf 'POSTGRES_DB=fixture\nPOSTGRES_USER=fixture\nPOSTGRES_PASSWORD=not-a-real-password\n' > "$env_file"
printf 'RADAR_DATABASE_PASSWORD=%064d\nRADAR_INTERNAL_TOKEN=%064d\n' 1 2 > "$work/.radar-credentials"
read_env_value() {
  case "$1" in MARKET_RADAR_INTERNAL_ENABLED) echo true ;; MARKET_RADAR_LIVE_ENABLED) echo false ;; esac
}
container_exists() { test -f "$work/$1"; }
network_exists() { return 0; }
assert_project_container() { [[ "$1" == wallet-market-radar* && "$2" == market-radar ]]; }
assert_project_network() { [[ "$1" == wallet-radar-egress && "$2" == market-radar-egress ]]; }
fail() { echo "$*" >&2; exit 1; }
check_cohosted_health() {
  if [[ "$failure" == cohosted ]]; then echo injected-cohosted >> "$work/log"; return 1; fi
}
# This test exercises lifecycle/rollback only; configuration generation and real
# database provisioning are covered separately. Never invoke a real container engine.
python3() { cat >/dev/null; }
run_container() {
  printf '%s\n' "$*" >> "$work/log"
  case "$1" in
    exec)
      if [[ "$2" == wallet-test-postgres ]]; then echo 1; fi ;;
    create)
      if [[ "$failure" == create ]]; then echo injected-create >> "$work/log"; return 19; fi
      echo new > "$work/wallet-market-radar" ;;
    rename) mv "$work/$2" "$work/$3" ;;
    rm) rm -f "$work/wallet-market-radar" ;;
    start)
      if [[ "$failure" == start && "$(cat "$work/wallet-market-radar")" == new ]]; then echo injected-start >> "$work/log"; return 19; fi ;;
  esac
  return 0
}
export -f read_env_value container_exists network_exists assert_project_container assert_project_network fail check_cohosted_health run_container python3
for failure in create start cohosted; do
  export failure
  echo old > "$work/wallet-market-radar"
  : > "$work/log"
  set +e
  bash -c 'source "$repo/scripts/deploy/deploy-oci-radar.sh"; deploy_private_radar'
  result=$?
  set -e
  if [[ "$result" == 0 || "$(cat "$work/wallet-market-radar")" != old || -e "$work/wallet-market-radar-rollback" ]] \
    || ! grep -qF "injected-$failure" "$work/log" \
    || ! grep -qF "rename wallet-market-radar wallet-market-radar-rollback" "$work/log"; then
    echo "Collector rollback failed for injected $failure failure." >&2
    exit 1
  fi
  echo "Collector rollback restored prior container after $failure failure."
done
