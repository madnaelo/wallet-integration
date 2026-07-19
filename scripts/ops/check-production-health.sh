#!/usr/bin/env bash
set -Eeuo pipefail

frontend_url="${FRONTEND_URL:-https://wallet-integration-theta.vercel.app}"
frontend_health_url="${FRONTEND_HEALTH_URL:-${frontend_url%/}/api/health}"
backend_health_url="${BACKEND_HEALTH_URL:-https://wallet-api.84-235-254-97.sslip.io/api/health}"
admin_ops_url="${ADMIN_OPS_URL:-https://wallet-api.84-235-254-97.sslip.io/api/admin/ops/summary}"
admin_api_key="${ADMIN_API_KEY:-}"
telegram_alert_bot_token="${TELEGRAM_ALERT_BOT_TOKEN:-}"
telegram_alert_chat_id="${TELEGRAM_ALERT_CHAT_ID:-}"
telegram_base_url="${TELEGRAM_ALERT_BASE_URL:-https://api.telegram.org}"
expected_commit="${EXPECTED_COMMIT:-}"
expected_commit_timestamp="${EXPECTED_COMMIT_TIMESTAMP:-}"
deploy_grace_minutes="${DEPLOY_GRACE_MINUTES:-30}"

if ! [[ "$deploy_grace_minutes" =~ ^[0-9]+$ ]]; then
  echo "DEPLOY_GRACE_MINUTES must be a non-negative integer." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

declare -a failures=()

check_http() {
  local name="$1"
  local url="$2"
  local output_file="$3"
  local status_file="$output_file.status"

  if ! curl --fail-with-body --silent --show-error --location --max-time 20 --retry 2 --retry-delay 2 \
    --write-out '%{http_code}' --output "$output_file" "$url" > "$status_file"; then
    failures+=("$name request failed: $url")
    return 1
  fi

  local status
  status="$(cat "$status_file")"
  if ! [[ "$status" =~ ^[23][0-9][0-9]$ ]]; then
    failures+=("$name returned HTTP $status: $url")
    return 1
  fi

  echo "$name ok ($status): $url"
}

frontend_file="$tmp_dir/frontend.html"
check_http "Frontend" "$frontend_url" "$frontend_file" || true

within_deploy_grace=false
frontend_actual_commit=""
backend_actual_commit=""
if [[ "$expected_commit_timestamp" =~ ^[0-9]+$ ]]; then
  commit_age_seconds="$(( $(date +%s) - expected_commit_timestamp ))"
  if [ "$commit_age_seconds" -lt "$((deploy_grace_minutes * 60))" ]; then
    within_deploy_grace=true
  fi
fi

validate_build_commit() {
  local name="$1"
  local payload_file="$2"
  local actual_commit
  if ! actual_commit="$(python3 - "$payload_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)

status = str(data.get("status", "")).lower()
if status != "ok":
    raise SystemExit(f"service status is {status or 'missing'}")

build = data.get("build") or {}
print(str(build.get("commit") or "").strip())
PY
  )"; then
    failures+=("$name health payload is invalid: $actual_commit")
    return 1
  fi

  if [ -z "$actual_commit" ]; then
    failures+=("$name health payload has no build commit")
    return 1
  fi
  if [ "$name" = "Frontend" ]; then
    frontend_actual_commit="$actual_commit"
  elif [ "$name" = "Backend" ]; then
    backend_actual_commit="$actual_commit"
  fi
  if [ -n "$expected_commit" ] && [ "$actual_commit" != "$expected_commit" ]; then
    if [ "$within_deploy_grace" = "true" ]; then
      echo "$name is still deploying: expected $expected_commit, found $actual_commit"
      return 0
    fi
    failures+=("$name is stale: expected commit $expected_commit, found $actual_commit")
    return 1
  fi
  echo "$name serves expected commit $actual_commit"
}

frontend_health_file="$tmp_dir/frontend-health.json"
if check_http "Frontend health" "$frontend_health_url" "$frontend_health_file"; then
  validate_build_commit "Frontend" "$frontend_health_file" || true
fi

health_file="$tmp_dir/backend-health.json"
if check_http "Backend health" "$backend_health_url" "$health_file"; then
  if ! health_summary="$(python3 - "$health_file" <<'PY' 2>&1
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)

status = str(data.get("status", "")).lower()
database = data.get("database") or {}
database_status = str(database.get("status", "")).lower()

if status != "ok":
    raise SystemExit(f"backend status is {status or 'missing'}")
if database_status != "ok":
    raise SystemExit(f"database status is {database_status or 'missing'}")

notifications = data.get("notifications") or {}
print(
    "backend ok; "
    f"uptimeSeconds={data.get('uptimeSeconds', '')}; "
    f"monitorRuns={notifications.get('monitorRuns', '')}; "
    f"monitorFailures={notifications.get('monitorFailures', '')}"
)
PY
  )"; then
    failures+=("Backend health payload failed validation: $health_summary")
  else
    echo "$health_summary"
  fi
  validate_build_commit "Backend" "$health_file" || true
fi

if [ -n "$frontend_actual_commit" ] && [ -n "$backend_actual_commit" ] \
  && [ "$frontend_actual_commit" != "$backend_actual_commit" ]; then
  failures+=("Frontend and backend serve different commits: $frontend_actual_commit vs $backend_actual_commit")
fi

if [ -n "$admin_api_key" ] && [ -n "$admin_ops_url" ]; then
  ops_file="$tmp_dir/admin-ops.json"
  # Never follow redirects while sending the privileged admin key. A redirect
  # to another host could otherwise disclose it outside the API origin.
  if curl --fail-with-body --silent --show-error --max-time 20 --retry 2 --retry-delay 2 \
    --header "X-Admin-Key: $admin_api_key" \
    --output "$ops_file" "$admin_ops_url"; then
    if ! ops_summary="$(python3 - "$ops_file" <<'PY' 2>&1
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)

last_monitor_error = str(data.get("lastMonitorError") or "").strip()
if last_monitor_error:
    raise SystemExit(f"last monitor error: {last_monitor_error[:300]}")
last_price_fetch_error = str(data.get("lastPriceFetchError") or "").strip()
if last_price_fetch_error:
    raise SystemExit(f"last price fetch error: {last_price_fetch_error[:300]}")

print(
    "ops ok; "
    f"monitorRuns={data.get('monitorRuns', '')}; "
    f"monitorFailures={data.get('monitorFailures', '')}; "
    f"priceFetchBatchesFailed={data.get('priceFetchBatchesFailed', '')}; "
    f"notificationDeliveriesFailed={data.get('notificationDeliveriesFailed', '')}"
)
PY
    )"; then
      failures+=("Admin ops payload failed validation: $ops_summary")
    else
      echo "$ops_summary"
    fi
  else
    failures+=("Admin ops request failed: $admin_ops_url")
  fi
else
  echo "Admin ops check skipped because ADMIN_API_KEY is not configured."
fi

send_telegram_alert() {
  local message="$1"
  if [ -z "$telegram_alert_bot_token" ] || [ -z "$telegram_alert_chat_id" ]; then
    echo "Telegram alert skipped because alert bot token or chat id is not configured." >&2
    return 0
  fi

  local trimmed_message="${message:0:3500}"
  curl --silent --show-error --fail --max-time 15 \
    --request POST "$telegram_base_url/bot$telegram_alert_bot_token/sendMessage" \
    --data-urlencode "chat_id=$telegram_alert_chat_id" \
    --data-urlencode "text=$trimmed_message" >/dev/null || true
}

if [ "${#failures[@]}" -gt 0 ]; then
  {
    echo "Swap Assistant production monitor failed."
    echo
    printf -- '- %s\n' "${failures[@]}"
    echo
    echo "Frontend: $frontend_url"
    echo "Backend: $backend_health_url"
    echo "Run: ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-local}/actions/runs/${GITHUB_RUN_ID:-local}"
  } > "$tmp_dir/alert.txt"

  alert_message="$(cat "$tmp_dir/alert.txt")"
  echo "$alert_message" >&2
  send_telegram_alert "$alert_message"
  exit 1
fi

echo "Production monitor passed."
