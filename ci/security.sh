#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name> [tag]}"
TAG="${2:-dev}"
REGISTRY="${REGISTRY:-}"

IMAGE="${REGISTRY:+$REGISTRY/}$SERVICE:$TAG"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/services/$SERVICE"

echo "Running security scan for $IMAGE"

# ---------------------------------------------------------------------------
# Source-level dependency scan (no image required) with OSV Scanner
# ---------------------------------------------------------------------------
if command -v osv-scanner >/dev/null 2>&1; then
  echo "--- OSV dependency scan ---"
  if [ -d "$SERVICE_DIR" ]; then
    osv-scanner scan "$SERVICE_DIR" || { echo "OSV scanner reported known vulnerabilities"; exit 1; }
  fi
else
  echo "osv-scanner not installed (optional)"
fi

# ---------------------------------------------------------------------------
# Image scan with Trivy (fail on HIGH/CRITICAL)
# ---------------------------------------------------------------------------
TRIVY_BIN=""

if command -v trivy >/dev/null 2>&1; then
  TRIVY_BIN="$(command -v trivy)"
elif command -v trivy.exe >/dev/null 2>&1; then
  TRIVY_BIN="$(command -v trivy.exe)"
elif command -v where >/dev/null 2>&1; then
  TRIVY_BIN="$(where trivy 2>/dev/null | head -n 1 | tr -d '\r' || true)"
fi

if [ -z "$TRIVY_BIN" ]; then
  echo "Trivy not installed. Run ./scripts/setup.sh"
  exit 1
fi

# Scan the local image when present, otherwise pull from the registry.
if command -v docker >/dev/null 2>&1 && docker image inspect "$IMAGE" >/dev/null 2>&1; then
  "$TRIVY_BIN" image \
    --severity HIGH,CRITICAL \
    --ignore-unfixed \
    --exit-code 1 \
    --no-progress \
    "$IMAGE"
else
  echo "Image $IMAGE not found locally; scanning remote reference"
  "$TRIVY_BIN" image \
    --severity HIGH,CRITICAL \
    --ignore-unfixed \
    --exit-code 1 \
    --no-progress \
    "$IMAGE"
fi

# ---------------------------------------------------------------------------
# Grype secondary scanner (fail on HIGH/CRITICAL)
# ---------------------------------------------------------------------------
if command -v grype >/dev/null 2>&1; then
  echo "--- Grype scan ---"
  grype "$IMAGE" \
    --fail-on high \
    --only-fixed || { echo "Grype reported HIGH/CRITICAL vulnerabilities"; exit 1; }
else
  echo "grype not installed (optional)"
fi

echo "Security scan passed for $IMAGE"
