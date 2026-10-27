#!/usr/bin/env bash
set -euo pipefail

# -------------------------------
# Config
# -------------------------------
GRAFANA_URL="${GRAFANA_URL:?Missing GRAFANA_URL}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:?Missing GRAFANA_API_KEY}"

DASHBOARD_DIR="${DASHBOARD_DIR:-ops/grafana/dashboards}"
ENVIRONMENT="${ENV:-dev}"
FOLDER_PREFIX="${FOLDER_PREFIX:-Platform}"

RETRY_COUNT="${RETRY_COUNT:-3}"
RETRY_DELAY="${RETRY_DELAY:-2}"

echo "🚀 Deploying Grafana dashboards (env=$ENVIRONMENT)..."

# -------------------------------
# Ensure curl exists
# -------------------------------
if ! command -v curl >/dev/null 2>&1; then
  echo "❌ curl is required"
  exit 1
fi

# -------------------------------
# Helper: API call with retry
# -------------------------------
api_call() {
  local method=$1
  local url=$2
  local data=$3

  for i in $(seq 1 "$RETRY_COUNT"); do
    response=$(curl -s -o /dev/stderr -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $GRAFANA_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$data" || true)

    if [[ "$response" == "200" || "$response" == "201" ]]; then
      return 0
    fi

    echo "⚠️ API call failed (attempt $i/$RETRY_COUNT), retrying..."
    sleep "$RETRY_DELAY"
  done

  echo "❌ API call failed after retries"
  exit 1
}

# -------------------------------
# Ensure folder exists
# -------------------------------
ensure_folder() {
  local folder_name="$1"

  echo "📁 Ensuring folder: $folder_name"

  folder_payload=$(cat <<EOF
{
  "title": "$folder_name"
}
EOF
)

  api_call "POST" "$GRAFANA_URL/api/folders" "$folder_payload"
}

# -------------------------------
# Deploy single dashboard
# -------------------------------
deploy_dashboard() {
  local file=$1
  local folder="$2"

  echo "📊 Deploying: $file → folder: $folder"

  dashboard_json=$(cat "$file")

  payload=$(cat <<EOF
{
  "dashboard": $dashboard_json,
  "folderTitle": "$folder",
  "overwrite": true
}
EOF
)

  api_call "POST" "$GRAFANA_URL/api/dashboards/db" "$payload"
}

# -------------------------------
# Main loop
# -------------------------------
if [[ ! -d "$DASHBOARD_DIR" ]]; then
  echo "❌ Dashboard directory not found: $DASHBOARD_DIR"
  exit 1
fi

# Folder naming strategy
FOLDER_NAME="${FOLDER_PREFIX}-${ENVIRONMENT}"

ensure_folder "$FOLDER_NAME"

# Deploy all dashboards
for file in "$DASHBOARD_DIR"/*.json; do
  [[ -f "$file" ]] || continue

  deploy_dashboard "$file" "$FOLDER_NAME"
done

echo "✅ All dashboards deployed successfully"
