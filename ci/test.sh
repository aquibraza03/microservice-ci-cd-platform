#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="${1:?Usage: $0 <service-name>}"
SERVICE_PATH="$ROOT_DIR/services/$SERVICE"

if [ ! -d "$SERVICE_PATH" ]; then
  echo "Service not found: $SERVICE"
  exit 1
fi

echo "Testing service: $SERVICE"

cd "$SERVICE_PATH"

if [ ! -f service.yml ]; then
  echo "service.yml missing in $SERVICE"
  exit 1
fi

if command -v yq >/dev/null 2>&1; then
  YQ_BIN=$(command -v yq)
elif [ -x "$ROOT_DIR/bin/yq" ]; then
  YQ_BIN="$ROOT_DIR/bin/yq"
elif [ -x "$ROOT_DIR/bin/yq.exe" ]; then
  YQ_BIN="$ROOT_DIR/bin/yq.exe"
else
  echo "yq not found. Install yq or place it in ./bin/yq"
  exit 1
fi

LANGUAGE=$("$YQ_BIN" -r '.language // .runtime // ""' service.yml)

case "$LANGUAGE" in
  node)
    if [ -f package.json ]; then
      echo "Running Node tests..."
      npm test
    else
      echo "No package.json found, running JavaScript syntax checks"
      find src -name "*.js" -print0 | xargs -0 -r -n1 node --check
    fi
    ;;

  python)
    if command -v pytest >/dev/null 2>&1; then
      echo "Running Python tests..."
      pytest
    else
      echo "pytest not installed, skipping tests"
    fi
    ;;

  go)
    echo "Running Go tests..."
    go test ./...
    ;;

  *)
    echo "Unknown language: $LANGUAGE"
    exit 1
    ;;
esac

echo "Test stage completed for $SERVICE"
