#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="ops/grafana/provision"
OUTPUT_FILE="$OUTPUT_DIR/datasources.generated.yml"

ENVIRONMENT="${ENV:-dev}"

mkdir -p "$OUTPUT_DIR"

echo "🔌 Generating Grafana datasources (env=$ENVIRONMENT)..."

# -------------------------------
# Ensure yq exists (optional)
# -------------------------------
if ! command -v yq >/dev/null 2>&1; then
  echo "⚠️ yq not found — continuing without YAML overrides"
fi

# -------------------------------
# Load environment config (optional)
# -------------------------------
ENV_FILE="deploy/environments/${ENVIRONMENT}.env"

if [[ -f "$ENV_FILE" ]]; then
  echo "📦 Loading environment config: $ENV_FILE"
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
else
  echo "⚠️ No environment file found for $ENVIRONMENT"
fi

# -------------------------------
# Defaults (safe, not hardcoded)
# -------------------------------
PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus:9090}"
LOKI_URL="${LOKI_URL:-}"
TEMPO_URL="${TEMPO_URL:-}"

# -------------------------------
# Init datasource file
# -------------------------------
cat > "$OUTPUT_FILE" <<EOF
apiVersion: 1

datasources:
EOF

# -------------------------------
# Helper: add datasource block
# -------------------------------
add_datasource() {
  local name=$1
  local type=$2
  local url=$3
  local is_default=$4

  cat >> "$OUTPUT_FILE" <<EOF
  - name: "${name}"
    type: "${type}"
    access: proxy
    url: "${url}"
    isDefault: ${is_default}
    editable: true
EOF
}

# -------------------------------
# Prometheus (metrics)
# -------------------------------
if [[ -n "$PROMETHEUS_URL" ]]; then
  echo "➕ Adding Prometheus datasource"

  add_datasource "Prometheus-${ENVIRONMENT}" "prometheus" "$PROMETHEUS_URL" "true"
fi

# -------------------------------
# Loki (logs)
# -------------------------------
if [[ -n "$LOKI_URL" ]]; then
  echo "➕ Adding Loki datasource"

  add_datasource "Loki-${ENVIRONMENT}" "loki" "$LOKI_URL" "false"
fi

# -------------------------------
# Tempo (tracing)
# -------------------------------
if [[ -n "$TEMPO_URL" ]]; then
  echo "➕ Adding Tempo datasource"

  add_datasource "Tempo-${ENVIRONMENT}" "tempo" "$TEMPO_URL" "false"
fi

# -------------------------------
# Multi-datasource support (future)
# -------------------------------
# Example:
# DATASOURCES="custom1 custom2"
# Can be extended later

# -------------------------------
# Validation
# -------------------------------
if ! grep -q "datasources:" "$OUTPUT_FILE"; then
  echo "❌ No datasources configured"
  exit 1
fi

echo "✅ Datasources generated → $OUTPUT_FILE"
