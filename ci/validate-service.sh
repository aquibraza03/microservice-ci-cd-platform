#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
SERVICE_PATH="services/$SERVICE"

echo "🔎 Validating service: $SERVICE"

# Check service directory exists
if [[ ! -d "$SERVICE_PATH" ]]; then
  echo "❌ Service directory not found: $SERVICE_PATH"
  exit 1
fi

# Required files
REQUIRED_FILES=(
  "service.yml"
  "Dockerfile"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$SERVICE_PATH/$file" ]]; then
    echo "❌ Missing required file: $file"
    exit 1
  fi
done

# Required directory
if [[ ! -d "$SERVICE_PATH/src" ]]; then
  echo "❌ Missing src/ directory"
  exit 1
fi

# Warn if src folder appears empty
if [[ ! -f "$SERVICE_PATH/src"/* ]] 2>/dev/null; then
  echo "⚠️ src/ appears empty — add source files"
fi

# Validate service.yml if yq exists
if command -v yq >/dev/null 2>&1; then

  NAME=$(yq -r '.name // empty' "$SERVICE_PATH/service.yml")
  LANGUAGE=$(yq -r '.language // empty' "$SERVICE_PATH/service.yml")
  PORT=$(yq -r '.docker.port // empty' "$SERVICE_PATH/service.yml")
  HEALTH=$(yq -r '.deploy.healthcheck // empty' "$SERVICE_PATH/service.yml")

  [[ -n "$NAME" ]]     || { echo "❌ service.yml missing 'name'"; exit 1; }
  [[ -n "$LANGUAGE" ]] || { echo "❌ service.yml missing 'language'"; exit 1; }
  [[ -n "$PORT" ]]     || { echo "❌ service.yml missing 'docker.port'"; exit 1; }
  [[ -n "$HEALTH" ]]   || { echo "❌ service.yml missing 'deploy.healthcheck'"; exit 1; }

else
  echo "⚠️ yq not installed — skipping YAML validation (install with: brew install yq)"
fi

echo "✅ Service validation passed: $SERVICE"
