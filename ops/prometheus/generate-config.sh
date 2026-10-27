#!/usr/bin/env bash
set -euo pipefail

# -------------------------------
# Config
# -------------------------------
OUTPUT_FILE="ops/prometheus/prometheus.generated.yml"
ENVIRONMENT="${ENV:-dev}"
SERVICES_DIR="services"

echo "📊 Generating Prometheus config (env=$ENVIRONMENT)..."

# -------------------------------
# Ensure tools exist
# -------------------------------
if ! command -v yq >/dev/null 2>&1; then
  echo "❌ yq is required"
  exit 1
fi

# -------------------------------
# Init config
# -------------------------------
cat > "$OUTPUT_FILE" <<EOF
global:
  scrape_interval: 15s

scrape_configs:
EOF

# -------------------------------
# Helper: safe YAML read
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
# Discover services
# -------------------------------
for svc_path in "$SERVICES_DIR"/*; do

  [[ -d "$svc_path" ]] || continue

  SERVICE=$(basename "$svc_path")
  SERVICE_FILE="$svc_path/service.yml"

  echo "🔍 Processing: $SERVICE"

  # Skip if no service.yml
  if [[ ! -f "$SERVICE_FILE" ]]; then
    echo "⚠️ Skipping $SERVICE (no service.yml)"
    continue
  fi

  # -------------------------------
  # Extract values (flexible schema)
  # -------------------------------
  PORT=$(get_yaml "$SERVICE_FILE" \
    '.docker.port' \
    '.port')

  METRICS_PATH=$(get_yaml "$SERVICE_FILE" \
    '.metrics.path' \
    '.observability.metrics.path')

  ENABLED=$(get_yaml "$SERVICE_FILE" \
    '.metrics.enabled' \
    '.observability.metrics.enabled')

  # -------------------------------
  # Defaults (no hardcoding, but safe fallback)
  # -------------------------------
  PORT=${PORT:-3000}
  METRICS_PATH=${METRICS_PATH:-/metrics}
  ENABLED=${ENABLED:-true}

  # -------------------------------
  # Skip if metrics disabled
  # -------------------------------
  if [[ "$ENABLED" != "true" ]]; then
    echo "⏭ Skipping $SERVICE (metrics disabled)"
    continue
  fi

  # -------------------------------
  # Generate scrape config
  # -------------------------------
  cat >> "$OUTPUT_FILE" <<EOF

  - job_name: "${SERVICE}"
    metrics_path: "${METRICS_PATH}"
    static_configs:
      - targets:
          - "${SERVICE}:${PORT}"
    relabel_configs:
      - source_labels: [__address__]
        target_label: service
        replacement: "${SERVICE}"
      - target_label: environment
        replacement: "${ENVIRONMENT}"

EOF

done

echo "✅ Prometheus config generated → $OUTPUT_FILE"
