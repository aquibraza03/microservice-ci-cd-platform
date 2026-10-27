#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="ops/logging/generated"
SERVICES_DIR="services"
ENVIRONMENT="${ENV:-dev}"

mkdir -p "$OUTPUT_DIR"

echo "📜 Generating logging configuration (env=$ENVIRONMENT)..."

# -------------------------------
# Ensure yq exists
# -------------------------------
if ! command -v yq >/dev/null 2>&1; then
  echo "❌ yq is required"
  exit 1
fi

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
# Detect global backend (optional)
# -------------------------------
GLOBAL_BACKEND="${LOG_BACKEND:-}"

# -------------------------------
# Process each service
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
  # Read logging config (flexible)
  # -------------------------------
  ENABLED=$(get_yaml "$SERVICE_FILE" \
    '.logging.enabled' \
    '.observability.logging.enabled')

  BACKEND=$(get_yaml "$SERVICE_FILE" \
    '.logging.backend' \
    '.observability.logging.backend')

  FORMAT=$(get_yaml "$SERVICE_FILE" \
    '.logging.format' \
    '.observability.logging.format')

  LEVEL=$(get_yaml "$SERVICE_FILE" \
    '.logging.level' \
    '.observability.logging.level')

  # -------------------------------
  # Defaults (no hardcoding, but safe fallback)
  # -------------------------------
  ENABLED=${ENABLED:-true}
  BACKEND=${BACKEND:-${GLOBAL_BACKEND:-stdout}}
  FORMAT=${FORMAT:-json}
  LEVEL=${LEVEL:-info}

  # -------------------------------
  # Skip if disabled
  # -------------------------------
  if [[ "$ENABLED" != "true" ]]; then
    echo "⏭ Skipping $SERVICE (logging disabled)"
    continue
  fi

  # -------------------------------
  # Generate service logging config
  # -------------------------------
  OUTPUT_FILE="$OUTPUT_DIR/${SERVICE}.logging.yml"

  cat > "$OUTPUT_FILE" <<EOF
service: ${SERVICE}
environment: ${ENVIRONMENT}

logging:
  enabled: true
  level: "${LEVEL}"
  format: "${FORMAT}"
  backend: "${BACKEND}"

  metadata:
    service: "${SERVICE}"
    environment: "${ENVIRONMENT}"

EOF

  # -------------------------------
  # Backend-specific extension (dynamic)
  # -------------------------------

  if [[ "$BACKEND" == "loki" ]]; then
    cat >> "$OUTPUT_FILE" <<EOF
  loki:
    labels:
      service: "${SERVICE}"
      environment: "${ENVIRONMENT}"
EOF
  fi

  if [[ "$BACKEND" == "elk" ]]; then
    cat >> "$OUTPUT_FILE" <<EOF
  elasticsearch:
    index: "${SERVICE}-${ENVIRONMENT}"
EOF
  fi

  if [[ "$BACKEND" == "stdout" ]]; then
    cat >> "$OUTPUT_FILE" <<EOF
  output:
    type: "console"
EOF
  fi

  echo "✅ Generated logging config → $OUTPUT_FILE"

done

echo "🎉 Logging configuration generation complete"
