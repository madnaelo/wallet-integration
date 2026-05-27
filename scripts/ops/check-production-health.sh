#!/usr/bin/env bash
set -Eeuo pipefail

frontend_url="${FRONTEND_URL:-https://wallet-integration-theta.vercel.app}"
backend_health_url="${BACKEND_HEALTH_URL:-https://wallet-api.84-235-254-97.sslip.io/api/health}"
admin_ops_url="${ADMIN_OPS_URL:-https://wallet-api.84-235-254-97.sslip.io/api/admin/ops/summary}"
admin_api_key="${ADMIN_API_KEY:-}"
telegram_alert_bot_token="${TELEGRAM_ALERT_BOT_TOKEN:-}"
telegram_alert_chat_id="${TELEGRAM_ALERT_CHAT_ID:-}"
telegram_base_url="${TELEGRAM_ALERT_BASE_URL:-https://api.telegram.org}"

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
fi

if [ -n "$admin_api_key" ] && [ -n "$admin_ops_url" ]; then
  ops_file="$tmp_dir/admin-ops.json"
  if curl --fail-with-body --silent --show-error --location --max-time 20 --retry 2 --retry-delay 2 \
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

print(
    "ops ok; "
    f"monitorRuns={data.get('monitorRuns', '')}; "
    f"monitorFailures={data.get('monitorFailures', '')}; "
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
    echo "The Wallet production monitor failed."
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
