#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
SERVICE_PATH="services/$SERVICE"

echo "🔎 Validating service: $SERVICE"

# Ensure script runs from repo root
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# Check service directory exists
if [[ ! -d "$SERVICE_PATH" ]]; then
  echo "❌ Service directory not found: $SERVICE_PATH"
  exit 1
fi

# Required files
REQUIRED_FILES=("service.yml" "Dockerfile")

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$SERVICE_PATH/$file" ]]; then
    echo "❌ Missing required file: $file"
    exit 1
  fi
done

# Check src directory
if [[ ! -d "$SERVICE_PATH/src" ]]; then
  echo "❌ Missing src/ directory"
  exit 1
fi

# Proper src validation (FIXED)
if [[ -z "$(find "$SERVICE_PATH/src" -type f 2>/dev/null)" ]]; then
  echo "⚠️ src/ appears empty — add source files"
else
  echo "✅ src/ contains files"
fi

# Flexible YAML reader (NO HARDCODING)
get_yaml_value() {
  local file=$1
  shift

  for key in "$@"; do
    value=$(yq e "$key // \"\"" "$file" 2>/dev/null || echo "")
    if [[ -n "$value" && "$value" != "null" ]]; then
      echo "$value"
      return 0
    fi
  done

  echo ""
}

# YAML validation
if command -v yq >/dev/null 2>&1; then

  SERVICE_FILE="$SERVICE_PATH/service.yml"

  NAME=$(get_yaml_value "$SERVICE_FILE" '.name')

  LANGUAGE=$(get_yaml_value "$SERVICE_FILE" \
    '.language' \
    '.runtime')

  PORT=$(get_yaml_value "$SERVICE_FILE" \
    '.docker.port' \
    '.port')

  HEALTH=$(get_yaml_value "$SERVICE_FILE" \
    '.deploy.healthcheck' \
    '.health.path' \
    '.health')

  # Debug output (VERY useful)
  echo "ℹ️ Detected config:"
  echo "  name      = $NAME"
  echo "  language  = $LANGUAGE"
  echo "  port      = $PORT"
  echo "  health    = $HEALTH"

  # Validation
  [[ -n "$NAME" ]]     || { echo "❌ Missing service name"; exit 1; }
  [[ -n "$LANGUAGE" ]] || { echo "❌ Missing language/runtime"; exit 1; }
  [[ -n "$PORT" ]]     || { echo "❌ Missing port"; exit 1; }
  [[ -n "$HEALTH" ]]   || { echo "❌ Missing healthcheck"; exit 1; }

else
  echo "⚠️ yq not installed — skipping YAML validation"
fi

echo "✅ Service validation passed: $SERVICE""✅ Service validation passed: $SERVICE"
