#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="ops/alerts/alerts.generated.yml"
SERVICES_DIR="services"
ENVIRONMENT="${ENV:-dev}"

echo "🚨 Generating alert rules (env=$ENVIRONMENT)..."

# -------------------------------
# Ensure yq exists
# -------------------------------
if ! command -v yq >/dev/null 2>&1; then
  echo "❌ yq is required"
  exit 1
fi

# -------------------------------
# Init alert file
# -------------------------------
cat > "$OUTPUT_FILE" <<EOF
groups:
  - name: services
    rules:
EOF

# -------------------------------
# Helper: flexible YAML reader
# -------------------------------
get_yaml() {
  local file=$1
  shift

  for key in "$@"; do
    val=$(yq e "$key // \"\"" "$file" 2>/dev/null || echo "")
    if [[ -n "$val" && "$val" != "null" ]]; then
      echo "$val"
      return 0
    fi
  done

  echo ""
}

# -------------------------------
# Iterate services
# -------------------------------
for svc_path in "$SERVICES_DIR"/*; do

  [[ -d "$svc_path" ]] || continue

  SERVICE=$(basename "$svc_path")
  SERVICE_FILE="$svc_path/service.yml"

  echo "🔍 Processing: $SERVICE"

  if [[ ! -f "$SERVICE_FILE" ]]; then
    echo "⚠️ Skipping $SERVICE (no service.yml)"
    continue
  fi

  # -------------------------------
  # Read alert config (flexible)
  # -------------------------------
  ALERT_ENABLED=$(get_yaml "$SERVICE_FILE" \
    '.alerts.enabled' \
    '.observability.alerts.enabled')

  ERROR_THRESHOLD=$(get_yaml "$SERVICE_FILE" \
    '.alerts.error_rate' \
    '.observability.alerts.error_rate')

  LATENCY_THRESHOLD=$(get_yaml "$SERVICE_FILE" \
    '.alerts.latency_ms' \
    '.observability.alerts.latency_ms')

  DOWNTIME_WINDOW=$(get_yaml "$SERVICE_FILE" \
    '.alerts.downtime_window' \
    '.observability.alerts.downtime_window')

  # -------------------------------
  # Defaults (safe fallback)
  # -------------------------------
  ALERT_ENABLED=${ALERT_ENABLED:-true}
  ERROR_THRESHOLD=${ERROR_THRESHOLD:-0.05}
  LATENCY_THRESHOLD=${LATENCY_THRESHOLD:-500}
  DOWNTIME_WINDOW=${DOWNTIME_WINDOW:-1m}

  # -------------------------------
  # Skip if alerts disabled
  # -------------------------------
  if [[ "$ALERT_ENABLED" != "true" ]]; then
    echo "⏭ Skipping $SERVICE (alerts disabled)"
    continue
  fi

  # -------------------------------
  # Generate alert rules
  # -------------------------------

  # Service Down
  cat >> "$OUTPUT_FILE" <<EOF
      - alert: ${SERVICE}_down
        expr: up{job="${SERVICE}"} == 0
        for: ${DOWNTIME_WINDOW}
        labels:
          severity: critical
          service: ${SERVICE}
          environment: ${ENVIRONMENT}
        annotations:
          summary: "${SERVICE} is down"
          description: "No metrics received from ${SERVICE}"
EOF

  # High Error Rate
  cat >> "$OUTPUT_FILE" <<EOF
      - alert: ${SERVICE}_high_error_rate
        expr: rate(http_requests_total{job="${SERVICE}",status=~"5.."}[5m]) 
              / rate(http_requests_total{job="${SERVICE}"}[5m]) > ${ERROR_THRESHOLD}
        for: 2m
        labels:
          severity: warning
          service: ${SERVICE}
          environment: ${ENVIRONMENT}
        annotations:
          summary: "${SERVICE} high error rate"
          description: "Error rate > ${ERROR_THRESHOLD}"
EOF

  # High Latency
  cat >> "$OUTPUT_FILE" <<EOF
      - alert: ${SERVICE}_high_latency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="${SERVICE}"}[5m])) 
              > ${LATENCY_THRESHOLD} / 1000
        for: 2m
        labels:
          severity: warning
          service: ${SERVICE}
          environment: ${ENVIRONMENT}
        annotations:
          summary: "${SERVICE} high latency"
          description: "Latency > ${LATENCY_THRESHOLD}ms"
EOF

done

echo "✅ Alert rules generated → $OUTPUT_FILE"
