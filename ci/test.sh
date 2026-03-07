#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"

SERVICE_PATH="services/$SERVICE"

if [ ! -d "$SERVICE_PATH" ]; then
  echo "❌ Service not found: $SERVICE"
  exit 1
fi

echo "🧪 Testing service: $SERVICE"

cd "$SERVICE_PATH"

if [ ! -f service.yml ]; then
  echo "❌ service.yml missing in $SERVICE"
  exit 1
fi

# Locate yq binary
if command -v yq >/dev/null 2>&1; then
  YQ_BIN=$(command -v yq)
elif [ -x "../../bin/yq" ]; then
  YQ_BIN="../../bin/yq"
else
  echo "❌ yq not found. Install yq or place it in ./bin/yq"
  exit 1
fi

LANGUAGE=$("$YQ_BIN" -r '.language' service.yml)

case "$LANGUAGE" in

  node)
    if [ -f package.json ]; then
      echo "Running Node tests..."
      npm test
    else
      echo "⚠️ No package.json found, skipping Node tests"
    fi
    ;;

  python)
    if command -v pytest >/dev/null 2>&1; then
      echo "Running Python tests..."
      pytest
    else
      echo "⚠️ pytest not installed, skipping tests"
    fi
    ;;

  go)
    echo "Running Go tests..."
    go test ./...
    ;;

  *)
    echo "⚠️ Unknown language: $LANGUAGE — skipping tests"
    ;;

esac

cd ../.. >/dev/null 2>&1 || true

echo "✅ Test stage completed for $SERVICE"
