#!/usr/bin/env bash
# Sourced only by the locked Swap Assistant release, after Flyway and backend health.
# shellcheck disable=SC2034,SC2154
deploy_private_radar() (
  set -Eeuo pipefail
  local enabled radar_container rollback bootstrap egress runtime_env bootstrap_env credentials
  enabled="$(read_env_value MARKET_RADAR_INTERNAL_ENABLED || true)"
  radar_container=wallet-market-radar
  rollback=wallet-market-radar-rollback
  bootstrap=wallet-market-radar-provision
  egress=wallet-radar-egress
  for name in "$radar_container" "$rollback" "$bootstrap"; do
    assert_project_container "$name" market-radar
  done
  case "$enabled" in
    false|"")
      for name in "$radar_container" "$rollback"; do
        if container_exists "$name"; then run_container rm -f "$name" >/dev/null; fi
      done
      return 0 ;;
    true) ;;
    *) fail "MARKET_RADAR_INTERNAL_ENABLED must be true or false." ;;
  esac
  if [ "$(read_env_value MARKET_RADAR_LIVE_ENABLED || true)" != false ]; then
    fail "Private Radar deployment requires commercial live mode explicitly disabled."
  fi
  if ! [[ "${RADAR_IMAGE:-}" =~ ^ghcr\.io/madnaelo/wallet-market-radar@sha256:[0-9a-f]{64}$ ]]; then
    fail "Private Radar requires the scanned immutable Swap Assistant collector image."
  fi
  if container_exists "$bootstrap"; then
    fail "An earlier Radar provisioning container still exists; inspect it before retrying."
  fi
  assert_project_network "$egress" market-radar-egress
  if ! network_exists "$egress"; then
    run_container network create --label com.swapassistant.app=backend \
      --label com.swapassistant.role=market-radar-egress "$egress" >/dev/null
  fi
  run_container pull "$RADAR_IMAGE" >/dev/null
  credentials="$deploy_path/.radar-credentials"
  runtime_env="$(mktemp "$deploy_path/.radar-runtime.XXXXXX")"
  bootstrap_env="$(mktemp "$deploy_path/.radar-bootstrap.XXXXXX")"
  trap 'rm -f "$runtime_env" "$bootstrap_env"' EXIT
  local role_exists
  role_exists="$(run_container exec "$postgres_container" psql -U "$postgres_user" -d "$postgres_db" -Atq \
    -c "SELECT count(*) FROM pg_roles WHERE rolname='swap_assistant_radar_collector'")"
  if [ ! -f "$credentials" ] && [ "$role_exists" != 0 ]; then
    fail "Collector role exists but its credential file is missing; refusing to rotate it."
  fi
  if [ -L "$credentials" ]; then fail "Radar credential file must not be a symlink."; fi
  python3 - "$env_file" "$credentials" "$runtime_env" "$bootstrap_env" "$database_host" <<'PY'
import os, secrets, sys
from urllib.parse import quote
backend_path, credentials_path, runtime_path, bootstrap_path, host = sys.argv[1:]
def read_env(path):
    with open(path, encoding="utf-8") as source:
        return dict(line.rstrip("\r\n").split("=", 1) for line in source if "=" in line and not line.startswith("#"))
if not os.path.exists(credentials_path):
    fd = os.open(credentials_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as target:
        target.write("RADAR_DATABASE_PASSWORD=" + secrets.token_hex(32) + "\nRADAR_INTERNAL_TOKEN=" + secrets.token_hex(32) + "\n")
os.chmod(credentials_path, 0o600)
secret = read_env(credentials_path)
backend = read_env(backend_path)
for key in ("RADAR_DATABASE_PASSWORD", "RADAR_INTERNAL_TOKEN"):
    if len(secret.get(key, "")) != 64 or any(c not in "0123456789abcdef" for c in secret[key]):
        raise SystemExit("Invalid private Radar credential file")
password = secret["RADAR_DATABASE_PASSWORD"]
runtime = {
    "RADAR_DATABASE_URL": "postgresql://swap_assistant_radar_collector:" + quote(password, safe="") + "@" + host + ":5432/" + quote(backend["POSTGRES_DB"], safe=""),
    "RADAR_INTERNAL_TOKEN": secret["RADAR_INTERNAL_TOKEN"],
    "RADAR_MODE": "research", "RADAR_VENUES": "binance",
    "MARKET_RADAR_LIVE_ENABLED": "false", "RADAR_MINIMUM_VENUES": "1",
    "RADAR_VENUES_PER_MARKET": "1", "RADAR_CONTINUOUS_MARKETS": "2",
    "RADAR_ON_DEMAND_MARKETS": "5", "RADAR_DEPTH": "200",
    "RADAR_MINIMUM_HISTORY_MS": "120000", "RADAR_RETENTION_DAYS": "7",
    "RADAR_BIND_ADDRESS": "0.0.0.0",
}
bootstrap = {
    "PGHOST": host, "PGPORT": "5432", "PGDATABASE": backend["POSTGRES_DB"],
    "PGUSER": backend["POSTGRES_USER"], "PGPASSWORD": backend["POSTGRES_PASSWORD"],
    "RADAR_DATABASE_PASSWORD": password,
}
for path, values in ((runtime_path, runtime), (bootstrap_path, bootstrap)):
    with open(path, "w", encoding="utf-8") as target:
        for key, value in values.items():
            if "\n" in value or "\r" in value:
                raise SystemExit("Invalid multiline Radar configuration")
            target.write(key + "=" + value + "\n")
    os.chmod(path, 0o600)
PY
  if [ "$role_exists" = 0 ]; then
    run_container run --rm --name "$bootstrap" --network "$internal_network" \
      --label com.swapassistant.app=backend --label com.swapassistant.role=market-radar \
      --env-file "$bootstrap_env" --read-only --cap-drop ALL --security-opt no-new-privileges \
      --memory 128m --memory-swap 128m --cpus 0.5 --pids-limit 64 \
      "$RADAR_IMAGE" node provision-radar-role.mjs
  fi
  rm -f "$bootstrap_env"
  # Recover an interrupted rollout before replacing the one active collector.
  if container_exists "$rollback" && ! container_exists "$radar_container"; then
    run_container rename "$rollback" "$radar_container"
    run_container start "$radar_container" >/dev/null
  fi
  if container_exists "$rollback"; then run_container rm -f "$rollback" >/dev/null; fi
  if container_exists "$radar_container"; then
    run_container stop --time 20 "$radar_container" >/dev/null
    run_container rename "$radar_container" "$rollback"
  fi
  rollback_radar() {
    if container_exists "$radar_container"; then run_container rm -f "$radar_container" >/dev/null; fi
    if container_exists "$rollback"; then
      run_container rename "$rollback" "$radar_container"
      run_container start "$radar_container" >/dev/null
    fi
  }
  trap 'code=$?; trap - ERR; rollback_radar || true; exit "$code"' ERR
  # Egress for official Binance feeds; no published ports and no reverse-proxy membership.
  run_container create --name "$radar_container" --restart unless-stopped --network "$egress" \
    --env-file "$runtime_env" --label com.swapassistant.app=backend --label com.swapassistant.role=market-radar \
    --label "org.opencontainers.image.revision=$git_commit" \
    --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m --cap-drop ALL \
    --security-opt no-new-privileges --memory 384m --memory-swap 384m --cpus 0.5 \
    --pids-limit 96 --log-opt max-size=10m "$RADAR_IMAGE" >/dev/null
  run_container network connect "$internal_network" "$radar_container"
  run_container start "$radar_container" >/dev/null
  local healthy=false
  for attempt in $(seq 1 60); do
    if run_container exec "$radar_container" node -e \
      'fetch("http://127.0.0.1:8092/internal/health",{headers:{Authorization:"Bearer "+process.env.RADAR_INTERNAL_TOKEN}}).then(async r=>{const h=await r.json();if(!r.ok || !(h.metrics?.updates>0) || !(h.metrics?.calculations>0) || h.metrics.persistenceFailures!==0 || JSON.stringify(h.allowedVenues)!=="[\"binance\"]")process.exit(1)}).catch(()=>process.exit(1))' >/dev/null 2>&1; then
      healthy=true
      break
    fi
    sleep 2
  done
  if [ "$healthy" != true ]; then
    rollback_radar
    fail "Private Binance collector did not receive live updates; previous collector restored."
  fi
  if ! check_cohosted_health; then
    rollback_radar
    fail "A protected cohosted health check failed; prior collector restored."
  fi
  trap - ERR
  if container_exists "$rollback"; then run_container rm -f "$rollback" >/dev/null; fi
  echo "Private Binance research collector is receiving live updates. No public collector port; commercial live disabled."
)
