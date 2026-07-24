#!/usr/bin/env bash
set -Eeuo pipefail

deploy_path="${OCI_DEPLOY_PATH:-/home/opc/wallet}"
env_file="${DEPLOY_ENV_FILE:-$deploy_path/backend.env}"
backend_image="${BACKEND_IMAGE:-}"
proxy_network="${OCI_PROXY_NETWORK:-${OCI_CONTAINER_NETWORK:-}}"
internal_network="${OCI_INTERNAL_NETWORK:-wallet-database}"
backend_container="${BACKEND_CONTAINER_NAME:-wallet-backend}"
candidate_container="${backend_container}-candidate"
rollback_container="${backend_container}-rollback"
failed_container="${backend_container}-failed"
postgres_container="${POSTGRES_CONTAINER_NAME:-wallet-postgres}"
legacy_postgres_container="${postgres_container}-legacy"
configured_postgres_volume="${POSTGRES_VOLUME_NAME:-}"
postgres_volume="${configured_postgres_volume:-wallet-postgres-data}"
postgres_image="${POSTGRES_IMAGE:-docker.io/library/postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777}"
backend_memory="${BACKEND_MEMORY:-448m}"
backend_memory_swap="${BACKEND_MEMORY_SWAP:-768m}"
backend_cpus="${BACKEND_CPUS:-1.0}"
postgres_memory="${POSTGRES_MEMORY:-224m}"
postgres_memory_swap="${POSTGRES_MEMORY_SWAP:-384m}"
postgres_cpus="${POSTGRES_CPUS:-1.0}"
app_version="${APP_VERSION:-${backend_image##*:}}"
git_commit="${GIT_COMMIT:-}"
deployed_at="${DEPLOYED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
api_domain="${WALLET_API_DOMAIN:-}"
caddyfile_path="${OCI_CADDYFILE_PATH:-}"
caddy_container="${OCI_CADDY_CONTAINER:-}"
cohosted_health_urls="${COHOSTED_HEALTH_URLS:-}"
caddy_site_path=""
shared_caddy_layout=false
postgres_env_file=""
registry_auth_dir=""
registry_token_file="${GHCR_TOKEN_FILE:-}"
caddy_site_backup=""

fail() {
  echo "$*" >&2
  exit 1
}

if [ -z "$backend_image" ]; then
  fail "BACKEND_IMAGE is required."
fi

if [ ! -f "$env_file" ]; then
  fail "Missing backend env file: $env_file"
fi

if [ -z "$git_commit" ]; then
  fail "GIT_COMMIT is required for a verifiable production deployment."
fi
if ! [[ "$git_commit" =~ ^[0-9a-fA-F]{40}$ ]]; then
  fail "GIT_COMMIT must be a full 40-character Git commit hash."
fi
if [ -z "$api_domain" ]; then
  fail "WALLET_API_DOMAIN is required."
fi
if ! [[ "$api_domain" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$ ]]; then
  fail "WALLET_API_DOMAIN is not a valid hostname."
fi
if [ -z "$proxy_network" ]; then
  fail "OCI_PROXY_NETWORK is required and must name the existing Caddy proxy network."
fi
if [ -z "$caddyfile_path" ] || [ -z "$caddy_container" ]; then
  fail "OCI_CADDYFILE_PATH and OCI_CADDY_CONTAINER are required."
fi

for resource_name in "$proxy_network" "$internal_network" "$backend_container" "$postgres_container" "$postgres_volume"; do
  if ! [[ "$resource_name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
    fail "Invalid container resource name: $resource_name"
  fi
done

read_env_value() {
  local key="$1"
  awk -v key="$key" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      sub(/\r$/, "", value)
      found = 1
    }
    END {
      if (!found) exit 1
      print value
    }
  ' "$env_file"
}

postgres_db="$(read_env_value POSTGRES_DB || true)"
postgres_user="$(read_env_value POSTGRES_USER || true)"
postgres_password="$(read_env_value POSTGRES_PASSWORD || true)"
if [ -z "$postgres_db" ] || [ -z "$postgres_user" ] || [ -z "$postgres_password" ]; then
  fail "POSTGRES_DB, POSTGRES_USER, and POSTGRES_PASSWORD must be set in $env_file."
fi
for postgres_identifier in "$postgres_db" "$postgres_user"; do
  if ! [[ "$postgres_identifier" =~ ^[A-Za-z0-9_.-]+$ ]]; then
    fail "PostgreSQL database and user names may contain only letters, digits, dot, underscore, and hyphen."
  fi
done

engine="${OCI_CONTAINER_ENGINE:-}"
engine_kind=""
if [ -n "$engine" ] && [ "$engine" != "docker" ] && [ "$engine" != "podman" ]; then
  fail "OCI_CONTAINER_ENGINE must be docker or podman."
fi
if [ -n "$engine" ] && ! command -v "$engine" >/dev/null 2>&1; then
  fail "Configured container engine is not installed: $engine"
fi
if [ -z "$engine" ]; then
  for candidate_engine in docker podman; do
    if ! command -v "$candidate_engine" >/dev/null 2>&1; then
      continue
    fi
    if { [ "$(id -u)" -eq 0 ] && "$candidate_engine" container inspect "$caddy_container" >/dev/null 2>&1; } \
      || { [ "$(id -u)" -ne 0 ] && sudo "$candidate_engine" container inspect "$caddy_container" >/dev/null 2>&1; }; then
      engine="$candidate_engine"
      break
    fi
  done
fi
if [ -z "$engine" ]; then
  fail "Could not find the Docker or Podman engine that owns $caddy_container."
fi
engine_version="$({ "$engine" --version || true; } 2>&1)"
if printf '%s' "$engine_version" | grep -qi podman; then
  engine_kind="podman"
elif printf '%s' "$engine_version" | grep -qi docker; then
  engine_kind="docker"
else
  fail "Could not identify whether $engine is Docker or Podman."
fi

deploy_lock_timeout="${DEPLOY_LOCK_TIMEOUT_SECONDS:-1800}"
if ! [[ "$deploy_lock_timeout" =~ ^[1-9][0-9]*$ ]]; then
  fail "DEPLOY_LOCK_TIMEOUT_SECONDS must be a positive integer."
fi
command -v flock >/dev/null 2>&1 \
  || fail "flock is required to serialize deployments on the shared host."
deploy_lock_dir="${XDG_STATE_HOME:-$HOME/.local/state}/application-platform"
mkdir -p "$deploy_lock_dir"
chmod 700 "$deploy_lock_dir"
deploy_lock_file="$deploy_lock_dir/deploy.lock"
exec 9>"$deploy_lock_file"
echo "Waiting for the shared-host deployment lock."
flock -w "$deploy_lock_timeout" 9 \
  || fail "Timed out waiting for another application deployment to finish."

umask 077
registry_auth_dir="$(mktemp -d "$deploy_path/.registry-auth.XXXXXX")"

run_container() {
  declare -a auth_env
  if [ "$engine_kind" = "podman" ]; then
    auth_env=(env "REGISTRY_AUTH_FILE=$registry_auth_dir/auth.json")
  else
    auth_env=(env "DOCKER_CONFIG=$registry_auth_dir")
  fi
  if [ "$(id -u)" -eq 0 ]; then
    "${auth_env[@]}" "$engine" "$@"
  else
    sudo "${auth_env[@]}" "$engine" "$@"
  fi
}

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

container_exists() {
  run_container container inspect "$1" >/dev/null 2>&1
}

network_exists() {
  run_container network inspect "$1" >/dev/null 2>&1
}

volume_exists() {
  run_container volume inspect "$1" >/dev/null 2>&1
}

container_is_running() {
  [ "$(run_container inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" = "true" ]
}

attach_container_network() {
  local network_name="$1"
  local container_name="$2"
  local alias_name="${3:-}"
  local output
  local -a connect_args=(network connect)

  if [ -n "$alias_name" ]; then
    connect_args+=(--alias "$alias_name")
  fi
  connect_args+=("$network_name" "$container_name")

  if output="$(run_container "${connect_args[@]}" 2>&1)"; then
    return 0
  fi
  if printf '%s' "$output" | grep -Eiq 'already connected|network is already connected'; then
    return 0
  fi
  printf '%s\n' "$output" >&2
  return 1
}

detach_container_network() {
  local network_name="$1"
  local container_name="$2"
  local output

  if output="$(run_container network disconnect -f "$network_name" "$container_name" 2>&1)"; then
    return 0
  fi
  if printf '%s' "$output" | grep -Eiq 'is not connected|not connected to network'; then
    return 0
  fi
  printf '%s\n' "$output" >&2
  return 1
}

container_label() {
  local container_name="$1"
  local label_name="$2"
  run_container inspect -f "{{index .Config.Labels \"$label_name\"}}" "$container_name" 2>/dev/null || true
}

network_label() {
  local network_name="$1"
  local label_name="$2"
  run_container network inspect -f "{{index .Labels \"$label_name\"}}" "$network_name" 2>/dev/null || true
}

volume_label() {
  local volume_name="$1"
  local label_name="$2"
  run_container volume inspect -f "{{index .Labels \"$label_name\"}}" "$volume_name" 2>/dev/null || true
}

container_uses_volume() {
  local container_name="$1"
  local volume_name="$2"
  run_container inspect -f \
    '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}' \
    "$container_name" 2>/dev/null | grep -Fxq "$volume_name"
}

container_data_volume() {
  local container_name="$1"
  run_container inspect -f \
    '{{range .Mounts}}{{if and (eq .Type "volume") (eq .Destination "/var/lib/postgresql/data")}}{{println .Name}}{{end}}{{end}}' \
    "$container_name" 2>/dev/null || true
}

container_uses_network() {
  local container_name="$1"
  local network_name="$2"
  # Dollar-prefixed names in this expression belong to the Go template.
  # shellcheck disable=SC2016
  run_container inspect -f \
    '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' \
    "$container_name" 2>/dev/null | grep -Fxq "$network_name"
}

container_network_names() {
  local container_name="$1"
  # Dollar-prefixed names in this expression belong to the Go template.
  # shellcheck disable=SC2016
  run_container inspect -f \
    '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' \
    "$container_name" 2>/dev/null || true
}

enforce_single_caddy_ingress_network() {
  local network_name
  container_uses_network "$caddy_container" "$proxy_network" \
    || fail "Shared Caddy is not attached to the configured proxy network."

  while IFS= read -r network_name; do
    [ -n "$network_name" ] || continue
    [ "$network_name" = "$proxy_network" ] && continue
    detach_container_network "$network_name" "$caddy_container" \
      || fail "Shared Caddy could not leave obsolete network $network_name."
  done < <(container_network_names "$caddy_container")
}

reload_shared_caddy_after_network_normalization() {
  run_container exec "$caddy_container" caddy validate --config /etc/caddy/Caddyfile >/dev/null \
    || fail "Shared Caddy rejected its current configuration."
  run_container exec "$caddy_container" caddy reload --config /etc/caddy/Caddyfile >/dev/null \
    || fail "Shared Caddy could not reload after ingress-network normalization."
}

assert_project_container() {
  local container_name="$1"
  local expected_role="$2"
  if ! container_exists "$container_name"; then
    return 0
  fi
  if [ "$(container_label "$container_name" com.swapassistant.app)" != "backend" ] \
    || [ "$(container_label "$container_name" com.swapassistant.role)" != "$expected_role" ]; then
    fail "Refusing to modify container not owned by Swap Assistant: $container_name"
  fi
}

assert_project_network() {
  local network_name="$1"
  local expected_role="$2"
  if ! network_exists "$network_name"; then
    return 0
  fi
  if [ "$(network_label "$network_name" com.swapassistant.app)" = "backend" ] \
    && [ "$(network_label "$network_name" com.swapassistant.role)" = "$expected_role" ]; then
    return 0
  fi

  if [ "$expected_role" = "proxy" ] \
    && container_exists "$caddy_container" \
    && container_uses_network "$caddy_container" "$network_name"; then
    echo "Using externally managed Caddy ingress network: $network_name" >&2
    return 0
  fi

  if [ "$expected_role" = "database" ]; then
    for project_container in \
      "$postgres_container" "$legacy_postgres_container" \
      "$backend_container" "$candidate_container" "$rollback_container" "$failed_container"; do
      if container_exists "$project_container" && container_uses_network "$project_container" "$network_name"; then
        echo "Using legacy project network verified through owned container $project_container: $network_name" >&2
        return 0
      fi
    done
  fi
  fail "Refusing to reuse an unverified network: $network_name"
}

assert_project_volume() {
  local volume_name="$1"
  if ! volume_exists "$volume_name"; then
    return 0
  fi
  if [ "$(volume_label "$volume_name" com.swapassistant.role)" = "database" ]; then
    return 0
  fi

  for database_container in "$postgres_container" "$legacy_postgres_container"; do
    if container_exists "$database_container" && container_uses_volume "$database_container" "$volume_name"; then
      echo "Using legacy project volume verified through owned container $database_container: $volume_name" >&2
      return 0
    fi
  done
  fail "Refusing to reuse volume not owned by Swap Assistant: $volume_name"
}

network_supports_container_dns() {
  run_container network inspect "$1" 2>/dev/null \
    | grep -Eiq '"dns_enabled"[[:space:]]*:[[:space:]]*true|"type"[[:space:]]*:[[:space:]]*"dnsname"'
}

podman_dns_plugin_installed() {
  local plugin_path
  for plugin_path in /usr/libexec/cni/dnsname /usr/lib/cni/dnsname /opt/cni/bin/dnsname; do
    if run_privileged test -x "$plugin_path"; then
      return 0
    fi
  done
  return 1
}

install_podman_dns_plugin() {
  if podman_dns_plugin_installed; then
    return 0
  fi
  if command -v dnf >/dev/null 2>&1; then
    run_privileged dnf install -y podman-plugins
  elif command -v yum >/dev/null 2>&1; then
    run_privileged yum install -y podman-plugins
  else
    fail "Podman CNI name resolution requires the podman-plugins package; install it before deploying."
  fi
  podman_dns_plugin_installed \
    || fail "podman-plugins installed without a usable dnsname CNI plugin."
}

create_database_network() {
  if [ "$engine_kind" = "podman" ]; then
    # CNI-based Podman disables container DNS on --internal networks. The
    # database remains private because it publishes no host ports.
    run_container network create \
      --label com.swapassistant.app=backend \
      --label com.swapassistant.role=database \
      "$internal_network" >/dev/null
  else
    run_container network create \
      --internal \
      --label com.swapassistant.app=backend \
      --label com.swapassistant.role=database \
      "$internal_network" >/dev/null
  fi
}

create_proxy_network() {
  run_container network create \
    --label com.swapassistant.app=backend \
    --label com.swapassistant.role=proxy \
    "$proxy_network" >/dev/null
}

cleanup() {
  if [ -n "$postgres_env_file" ]; then
    rm -f "$postgres_env_file"
  fi
  if [ -n "$registry_auth_dir" ]; then
    rm -rf "$registry_auth_dir"
  fi
  if [ -n "$registry_token_file" ]; then
    rm -f "$registry_token_file"
  fi
  if [ -n "$caddy_site_backup" ]; then
    rm -f "$caddy_site_backup"
  fi
}
trap cleanup EXIT

registry_token="${GHCR_TOKEN:-}"
if [ -z "$registry_token" ] && [ -n "$registry_token_file" ]; then
  [ -f "$registry_token_file" ] || fail "GHCR_TOKEN_FILE does not exist."
  registry_token="$(<"$registry_token_file")"
fi
if [ -n "${GHCR_USERNAME:-}" ] || [ -n "$registry_token" ]; then
  if [ -z "${GHCR_USERNAME:-}" ] || [ -z "$registry_token" ]; then
    fail "GHCR_USERNAME and a registry token must be provided together."
  fi
  printf '%s' "$registry_token" | run_container login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
fi
registry_token=""
unset GHCR_TOKEN
if [ -n "$registry_token_file" ]; then
  rm -f "$registry_token_file"
fi

for api_container in "$backend_container" "$candidate_container" "$rollback_container" "$failed_container"; do
  assert_project_container "$api_container" api
done
for database_container in "$postgres_container" "$legacy_postgres_container"; do
  assert_project_container "$database_container" database
done

active_postgres_volume=""
for database_container in "$postgres_container" "$legacy_postgres_container"; do
  if ! container_exists "$database_container"; then
    continue
  fi
  container_volume="$(container_data_volume "$database_container")"
  if [ -z "$container_volume" ]; then
    fail "Owned PostgreSQL container must use a named volume at /var/lib/postgresql/data: $database_container"
  fi
  if [ -n "$active_postgres_volume" ] && [ "$active_postgres_volume" != "$container_volume" ]; then
    fail "Owned PostgreSQL containers disagree on the production data volume."
  fi
  active_postgres_volume="$container_volume"
done

if [ -n "$active_postgres_volume" ]; then
  if [ "$active_postgres_volume" != "$postgres_volume" ]; then
    if [ -n "$configured_postgres_volume" ]; then
      fail "Configured PostgreSQL volume does not match the volume mounted by the owned database container."
    fi
    postgres_volume="$active_postgres_volume"
  fi
  echo "Using production data volume verified through the owned PostgreSQL container: $postgres_volume" >&2
fi
if ! [[ "$postgres_volume" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
  fail "Invalid PostgreSQL volume name discovered from the owned database container."
fi

assert_project_network "$internal_network" database
if [ -z "$active_postgres_volume" ]; then
  assert_project_volume "$postgres_volume"
fi

container_exists "$caddy_container" || fail "The configured Caddy container does not exist: $caddy_container"
if ! network_exists "$proxy_network"; then
  if [ "$engine_kind" = "podman" ]; then
    install_podman_dns_plugin
  fi
  create_proxy_network
fi
assert_project_network "$proxy_network" proxy
if [ "$engine_kind" = "podman" ]; then
  network_supports_container_dns "$proxy_network" \
    || fail "Proxy network $proxy_network must support container DNS."
fi
attach_container_network "$proxy_network" "$caddy_container" \
  || fail "Caddy container $caddy_container could not join proxy network $proxy_network."
[ -f "$caddyfile_path" ] || fail "Configured Caddyfile does not exist: $caddyfile_path"
caddy_site_path="$caddyfile_path"
if grep -Eq '^[[:space:]]*import[[:space:]]+/etc/caddy/sites/' "$caddyfile_path"; then
  shared_caddy_layout=true
  caddy_sites_dir="${OCI_CADDY_SITES_DIR:-$(dirname "$caddyfile_path")/Caddy-sites}"
  caddy_site_path="$caddy_sites_dir/wallet.caddy"
  [ -f "$caddy_site_path" ] \
    || fail "Shared Caddy layout is missing the Wallet site fragment: $caddy_site_path"
  enforce_single_caddy_ingress_network
  reload_shared_caddy_after_network_normalization
fi

check_cohosted_health() {
  local url
  local authority
  local hostname
  local attempt
  local healthy
  for url in $cohosted_health_urls; do
    case "$url" in
      https://*) ;;
      *) fail "COHOSTED_HEALTH_URLS accepts only space-separated HTTPS URLs." ;;
    esac
    authority="${url#https://}"
    authority="${authority%%/*}"
    hostname="${authority%%:*}"
    [ -n "$hostname" ] || return 1
    healthy=false
    for attempt in $(seq 1 7); do
      if run_container exec "$caddy_container" curl --fail --silent --show-error \
        --resolve "${hostname}:443:127.0.0.1" \
        --connect-timeout 5 --max-time 15 "$url" >/dev/null; then
        healthy=true
        break
      fi
      if [ "$attempt" -lt 7 ]; then
        sleep 2
      fi
    done
    [ "$healthy" = "true" ] || return 1
  done
}

check_cohosted_health \
  || fail "A cohosted application was unhealthy before Wallet deployment; no Wallet release was started."

if ! network_exists "$internal_network"; then
  create_database_network
fi
if [ "$engine_kind" = "podman" ] && ! network_supports_container_dns "$internal_network"; then
  install_podman_dns_plugin
  if [ "$(network_label "$internal_network" com.swapassistant.role)" != "database" ]; then
    fail "Refusing to recreate an OCI database network not owned by Swap Assistant: $internal_network"
  fi
  for project_container in \
    "$backend_container" "$candidate_container" "$rollback_container" "$failed_container" \
    "$postgres_container" "$legacy_postgres_container"; do
    if container_exists "$project_container"; then
      detach_container_network "$internal_network" "$project_container"
    fi
  done
  run_container network rm "$internal_network" >/dev/null
  create_database_network
  network_supports_container_dns "$internal_network" \
    || fail "Podman database network $internal_network still has no container DNS support."
fi
network_is_internal=false
if run_container network inspect "$internal_network" 2>/dev/null \
  | grep -Eiq '"[Ii]nternal"[[:space:]]*:[[:space:]]*true'; then
  network_is_internal=true
fi
if [ "$engine_kind" = "docker" ] && [ "$network_is_internal" != "true" ]; then
  fail "Docker database network $internal_network must be internal."
fi
if [ "$engine_kind" = "podman" ] && [ "$network_is_internal" = "true" ]; then
  fail "Podman database network $internal_network must support container DNS; use a dedicated non-internal network with no published database ports."
fi

if ! volume_exists "$postgres_volume"; then
  run_container volume create \
    --label com.swapassistant.app=backend \
    --label com.swapassistant.role=database \
    "$postgres_volume" >/dev/null
fi

umask 077
postgres_env_file="$(mktemp "$deploy_path/.wallet-postgres-env.XXXXXX")"
{
  printf 'POSTGRES_DB=%s\n' "$postgres_db"
  printf 'POSTGRES_USER=%s\n' "$postgres_user"
  printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
} > "$postgres_env_file"

run_postgres() {
  declare -a log_args=(--log-opt max-size=10m)
  if [ "$engine_kind" = "docker" ]; then
    log_args+=(--log-opt max-file=5)
  fi
  run_container run -d \
    --name "$postgres_container" \
    --restart unless-stopped \
    --network "$internal_network" \
    --network-alias "$postgres_container" \
    --env-file "$postgres_env_file" \
    --label com.swapassistant.app=backend \
    --label com.swapassistant.role=database \
    --memory "$postgres_memory" \
    --memory-swap "$postgres_memory_swap" \
    --cpus "$postgres_cpus" \
    --pids-limit 256 \
    "${log_args[@]}" \
    -v "$postgres_volume:/var/lib/postgresql/data:Z" \
    "$postgres_image" >/dev/null
}

wait_for_postgres() {
  for attempt in $(seq 1 60); do
    if readiness="$(
      run_container exec "$postgres_container" \
        psql -U "$postgres_user" -d "$postgres_db" -Atq \
        -v ON_ERROR_STOP=1 \
        -c "SELECT 1;" 2>/dev/null
    )" && [ "$readiness" = "1" ]; then
      return 0
    fi
    if [ "$attempt" = "60" ]; then
      run_container logs --tail=120 "$postgres_container" >&2 || true
      return 1
    fi
    sleep 2
  done
}

# Recover the known-good backend if a previous promotion was interrupted.
if container_exists "$rollback_container"; then
  run_container rm -f "$backend_container" >/dev/null 2>&1 || true
  run_container rename "$rollback_container" "$backend_container"
  attach_container_network "$internal_network" "$backend_container"
  attach_container_network "$proxy_network" "$backend_container" "$backend_container"
  run_container start "$backend_container" >/dev/null
fi
run_container rm -f "$candidate_container" >/dev/null 2>&1 || true
run_container rm -f "$failed_container" >/dev/null 2>&1 || true
if ! container_exists "$postgres_container" && container_exists "$legacy_postgres_container"; then
  run_container rename "$legacy_postgres_container" "$postgres_container"
  run_container start "$postgres_container" >/dev/null
fi
if container_exists "$postgres_container" && container_exists "$legacy_postgres_container"; then
  if ! container_is_running "$postgres_container"; then
    run_container start "$postgres_container" >/dev/null
  fi
  if wait_for_postgres; then
    run_container rm -f "$legacy_postgres_container" >/dev/null
  else
    run_container rm -f "$postgres_container" >/dev/null 2>&1 || true
    run_container rename "$legacy_postgres_container" "$postgres_container"
    run_container start "$postgres_container" >/dev/null
  fi
fi

if container_exists "$backend_container"; then
  attach_container_network "$internal_network" "$backend_container"
fi

postgres_needs_recreate=false
if container_exists "$postgres_container"; then
  if [ "$(container_label "$postgres_container" com.swapassistant.role)" != "database" ]; then
    postgres_needs_recreate=true
  fi
else
  postgres_needs_recreate=true
fi

if [ "$postgres_needs_recreate" = "true" ]; then
  run_container pull "$postgres_image" >/dev/null
  if container_exists "$postgres_container"; then
    if ! container_is_running "$postgres_container"; then
      run_container start "$postgres_container" >/dev/null
    fi
    wait_for_postgres || fail "Existing PostgreSQL did not become ready before its safety backup."
    OCI_DEPLOY_PATH="$deploy_path" BACKUP_DIR="$deploy_path/backups/pre-hardening" BACKUP_RETENTION_DAYS=30 \
      "$deploy_path/scripts/deploy/backup-oci-postgres.sh"
    run_container stop --time 30 "$postgres_container" >/dev/null
    run_container rename "$postgres_container" "$legacy_postgres_container"
  fi
  if ! run_postgres || ! wait_for_postgres; then
    run_container rm -f "$postgres_container" >/dev/null 2>&1 || true
    if container_exists "$legacy_postgres_container"; then
      run_container rename "$legacy_postgres_container" "$postgres_container"
      run_container start "$postgres_container" >/dev/null
    fi
    fail "Hardened PostgreSQL failed to start; the previous database container was restored."
  fi
  run_container rm -f "$legacy_postgres_container" >/dev/null 2>&1 || true
else
  if ! container_is_running "$postgres_container"; then
    run_container start "$postgres_container" >/dev/null
  fi
  attach_container_network "$internal_network" "$postgres_container" "$postgres_container"
fi
wait_for_postgres || fail "PostgreSQL failed its readiness check."

if [ -n "$(run_container port "$postgres_container" 2>/dev/null)" ]; then
  fail "PostgreSQL must not publish host ports."
fi
postgres_reachable_by_name() {
  run_container run --rm --network "$internal_network" "$postgres_image" \
    pg_isready -h "$postgres_container" -U "$postgres_user" -d "$postgres_db" >/dev/null 2>&1
}

valid_ipv4_address() {
  local address="$1"
  local octet
  local -a octets

  IFS=. read -r -a octets <<< "$address"
  [ "${#octets[@]}" -eq 4 ] || return 1
  for octet in "${octets[@]}"; do
    [[ "$octet" =~ ^[0-9]{1,3}$ ]] || return 1
    [ "$octet" -le 255 ] || return 1
  done
}

find_reachable_postgres_ip() {
  local address
  local container_addresses

  container_addresses="$(run_container exec "$postgres_container" sh -c 'hostname -i 2>/dev/null || true')"
  for address in $container_addresses; do
    if valid_ipv4_address "$address" \
      && run_container run --rm --network "$internal_network" "$postgres_image" \
        pg_isready -h "$address" -U "$postgres_user" -d "$postgres_db" >/dev/null 2>&1; then
      printf '%s' "$address"
      return 0
    fi
  done
  return 1
}

database_host="$postgres_container"
if ! postgres_reachable_by_name; then
  echo "Refreshing PostgreSQL network registration after a failed container DNS probe." >&2
  run_container restart --time 30 "$postgres_container" >/dev/null
  wait_for_postgres || fail "PostgreSQL did not recover after refreshing its network registration."
fi
if ! postgres_reachable_by_name; then
  database_host="$(find_reachable_postgres_ip || true)"
  if [ -z "$database_host" ]; then
    fail "PostgreSQL is ready locally but is unreachable from other containers on $internal_network."
  fi
  echo "Container DNS remains unavailable; using a verified private database address for this release." >&2
fi

detach_container_network "$proxy_network" "$postgres_container" \
  || fail "PostgreSQL could not be detached from the proxy network."

extract_site_block() {
  awk -v domain="$api_domain" '
    {
      compact = $0
      gsub(/[[:space:]]/, "", compact)
      if (!inside && compact == domain "{") {
        inside = 1
      }
      if (inside) {
        print
        braces = $0
        opens = gsub(/\{/, "{", braces)
        braces = $0
        closes = gsub(/\}/, "}", braces)
        depth += opens - closes
        if (depth == 0) exit
      }
    }
  ' "$caddy_site_path"
}

site_block="$(extract_site_block)"
if [ -z "$site_block" ]; then
  fail "Caddy has no explicit $api_domain site block. Configure it once before deploying."
fi
if ! printf '%s\n' "$site_block" | grep -Eq 'reverse_proxy[[:space:]]+[^[:space:]]+:8080([[:space:]]|$)'; then
  fail "The existing $api_domain Caddy block has no valid backend route."
fi
run_container exec "$caddy_container" caddy validate --config /etc/caddy/Caddyfile >/dev/null \
  || fail "Caddy rejected its current configuration."
run_container exec "$caddy_container" caddy reload --config /etc/caddy/Caddyfile >/dev/null

enable_backups="$(read_env_value ENABLE_POSTGRES_BACKUP_TIMER || printf 'false')"
if [ "$enable_backups" = "true" ]; then
  backup_script="$deploy_path/scripts/deploy/backup-oci-postgres.sh"
  backup_check_script="$deploy_path/scripts/deploy/check-postgres-backup.sh"
  restore_check_script="$deploy_path/scripts/deploy/verify-postgres-restore.sh"
  oci_cli_installer="$deploy_path/scripts/deploy/install-oci-cli.sh"
  backup_service_template="$deploy_path/infra/systemd/wallet-postgres-backup.service"
  backup_timer_template="$deploy_path/infra/systemd/wallet-postgres-backup.timer"
  if [ ! -f "$backup_script" ] || [ ! -f "$backup_check_script" ] \
    || [ ! -f "$restore_check_script" ] || [ ! -f "$oci_cli_installer" ] \
    || [ ! -f "$backup_service_template" ] || [ ! -f "$backup_timer_template" ]; then
    fail "Backup timer requested, but backup assets were not uploaded."
  fi
  command -v systemctl >/dev/null 2>&1 || fail "Backup timer requested, but systemctl is unavailable."

  if [ -n "$(read_env_value OCI_BACKUP_BUCKET || true)" ] && ! command -v oci >/dev/null 2>&1; then
    chmod +x "$oci_cli_installer"
    "$oci_cli_installer"
  fi

  # systemd cannot execute user_home_t files when SELinux is enforcing. Install
  # the runner in a standard executable location and restore its platform label.
  backup_executable="/usr/local/bin/swap-assistant-postgres-backup"
  backup_check_executable="/usr/local/bin/swap-assistant-postgres-backup-check"
  restore_check_executable="/usr/local/bin/swap-assistant-postgres-restore-check"
  sudo install -o root -g root -m 0755 "$backup_script" "$backup_executable"
  sudo install -o root -g root -m 0755 "$backup_check_script" "$backup_check_executable"
  sudo install -o root -g root -m 0755 "$restore_check_script" "$restore_check_executable"
  if command -v restorecon >/dev/null 2>&1; then
    sudo restorecon -F "$backup_executable"
    sudo restorecon -F "$backup_check_executable"
    sudo restorecon -F "$restore_check_executable"
  fi
  escaped_deploy_path="$(printf '%s' "$deploy_path" | sed 's/[&|\\]/\\&/g')"
  sudo sed "s|__WALLET_DEPLOY_PATH__|$escaped_deploy_path|g" "$backup_service_template" \
    | sudo tee /etc/systemd/system/wallet-postgres-backup.service >/dev/null
  sudo cp "$backup_timer_template" /etc/systemd/system/wallet-postgres-backup.timer
  sudo systemctl daemon-reload
  sudo systemctl reset-failed wallet-postgres-backup.service >/dev/null 2>&1 || true
  if ! sudo systemctl start wallet-postgres-backup.service; then
    if command -v journalctl >/dev/null 2>&1; then
      sudo journalctl -u wallet-postgres-backup.service --no-pager -n 80 >&2 || true
    fi
    fail "The immediate PostgreSQL backup verification failed."
  fi
  sudo systemctl enable --now wallet-postgres-backup.timer >/dev/null
  sudo systemctl is-enabled --quiet wallet-postgres-backup.timer \
    || fail "PostgreSQL backup timer was not enabled."
  sudo systemctl is-active --quiet wallet-postgres-backup.timer \
    || fail "PostgreSQL backup timer is not active."
  sudo env OCI_DEPLOY_PATH="$deploy_path" OCI_CONTAINER_ENGINE="$engine" \
    "$backup_check_executable" \
    || fail "The freshly created PostgreSQL backup failed its health check."
  echo "PostgreSQL backup upload and integrity were verified; the daily timer is enabled and active."
fi

run_container pull "$backend_image" >/dev/null

declare -a backend_log_args=(--log-opt max-size=10m)
if [ "$engine_kind" = "docker" ]; then
  backend_log_args+=(--log-opt max-file=5)
fi
run_container run -d \
  --name "$candidate_container" \
  --restart unless-stopped \
  --network "$internal_network" \
  --env-file "$env_file" \
  -e "DATABASE_URL=jdbc:postgresql://$database_host:5432/$postgres_db" \
  -e "APP_VERSION=$app_version" \
  -e "GIT_COMMIT=$git_commit" \
  -e "DEPLOYED_AT=$deployed_at" \
  --label com.swapassistant.app=backend \
  --label com.swapassistant.role=api \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  --memory "$backend_memory" \
  --memory-swap "$backend_memory_swap" \
  --cpus "$backend_cpus" \
  --pids-limit 256 \
  "${backend_log_args[@]}" \
  "$backend_image" >/dev/null

candidate_healthy=false
for attempt in $(seq 1 90); do
  if candidate_health="$(run_container exec "$candidate_container" wget -q -O - http://127.0.0.1:8080/api/health 2>/dev/null)" \
    && printf '%s' "$candidate_health" | grep -qF "$git_commit"; then
    candidate_healthy=true
    break
  fi
  if [ "$attempt" = "90" ]; then
    run_container logs --tail=180 "$candidate_container" >&2 || true
  else
    sleep 2
  fi
done
if [ "$candidate_healthy" != "true" ]; then
  run_container rm -f "$candidate_container" >/dev/null 2>&1 || true
  fail "Candidate backend failed its health or build-identity check."
fi

had_previous_backend=false
if container_exists "$backend_container"; then
  had_previous_backend=true
  run_container stop --time 30 "$backend_container" >/dev/null
  detach_container_network "$proxy_network" "$backend_container"
  run_container rename "$backend_container" "$rollback_container"
fi
run_container rename "$candidate_container" "$backend_container"
attach_container_network "$proxy_network" "$backend_container" "$backend_container"
if [ "$shared_caddy_layout" = "true" ]; then
  caddy_site_backup="$(mktemp "$deploy_path/.wallet-caddy-site.XXXXXX")"
  cp "$caddy_site_path" "$caddy_site_backup"
  caddy_site_next="$(mktemp "$deploy_path/.wallet-caddy-next.XXXXXX")"
  cat >"$caddy_site_next" <<CADDY_SITE
# wallet-backend:${api_domain}
${api_domain} {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
  reverse_proxy ${backend_container}:8080
}
CADDY_SITE
  chmod 644 "$caddy_site_next"
  mv "$caddy_site_next" "$caddy_site_path"
fi
caddy_reloaded=true
if ! run_container exec "$caddy_container" caddy validate --config /etc/caddy/Caddyfile >/dev/null \
  || ! run_container exec "$caddy_container" caddy reload --config /etc/caddy/Caddyfile >/dev/null; then
  caddy_reloaded=false
fi

health_url="${BACKEND_HEALTH_URL:-https://$api_domain/api/health}"
fetch_backend_health() {
  if [ -n "${BACKEND_HEALTH_URL:-}" ]; then
    curl --fail --silent --show-error --connect-timeout 5 --max-time 15 "$health_url"
  else
    # Validate the real TLS virtual host from inside Caddy. Podman hosts may not
    # be able to hairpin through their own published ports.
    run_container exec "$caddy_container" curl --fail --silent --show-error \
      --resolve "$api_domain:443:127.0.0.1" \
      --connect-timeout 5 --max-time 15 "$health_url"
  fi
}
external_healthy=false
if [ "$caddy_reloaded" = "true" ]; then
  for attempt in $(seq 1 30); do
    if health_body="$(fetch_backend_health 2>/dev/null)" \
      && printf '%s' "$health_body" | grep -qF "$git_commit" \
      && check_cohosted_health; then
      external_healthy=true
      break
    fi
    sleep 5
  done
fi

if [ "$external_healthy" != "true" ]; then
  echo "The promoted backend or a protected cohosted application failed verification; rolling back." >&2
  run_container stop --time 20 "$backend_container" >/dev/null 2>&1 || true
  detach_container_network "$proxy_network" "$backend_container" >/dev/null 2>&1 || true
  run_container rename "$backend_container" "$failed_container" >/dev/null 2>&1 || true
  if [ "$had_previous_backend" = "true" ] && container_exists "$rollback_container"; then
    run_container rename "$rollback_container" "$backend_container"
    attach_container_network "$proxy_network" "$backend_container" "$backend_container"
    run_container start "$backend_container" >/dev/null
  fi
  if [ "$shared_caddy_layout" = "true" ] && [ -n "$caddy_site_backup" ] \
    && [ -f "$caddy_site_backup" ]; then
    cp "$caddy_site_backup" "$caddy_site_path"
  fi
  run_container exec "$caddy_container" caddy reload --config /etc/caddy/Caddyfile >/dev/null || true
  run_container rm -f "$failed_container" >/dev/null 2>&1 || true
  fail "Backend release failed and the previous release was restored."
fi

if container_exists "$rollback_container"; then
  run_container rm -f "$rollback_container" >/dev/null
fi

for legacy_network in wallet-internal wallet-db; do
  if [ "$legacy_network" = "$internal_network" ] || ! network_exists "$legacy_network"; then
    continue
  fi
  legacy_role="$(network_label "$legacy_network" com.swapassistant.role)"
  if [ "$legacy_role" != "internal" ] && [ "$legacy_role" != "database" ]; then
    continue
  fi
  detach_container_network "$legacy_network" "$postgres_container"
  detach_container_network "$legacy_network" "$backend_container"
  run_container network rm "$legacy_network" >/dev/null 2>&1 || true
done

echo "Backend is healthy at $health_url and serves commit $git_commit."
