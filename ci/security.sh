#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
TAG="${2:-latest}"

IMAGE="$SERVICE:$TAG"

echo "🔒 Running security scan for $IMAGE"

# Check Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker not installed"
  exit 1
fi

# Check if Docker image exists locally
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "⚠️ Image $IMAGE not found locally, skipping scan"
  exit 0
fi

# Check if Trivy exists
# -------------------------------
# Resolve trivy (no hardcoding)
# -------------------------------
TRIVY_BIN=""

if command -v trivy >/dev/null 2>&1; then
  TRIVY_BIN="$(command -v trivy)"
elif command -v trivy.exe >/dev/null 2>&1; then
  TRIVY_BIN="$(command -v trivy.exe)"
elif command -v where >/dev/null 2>&1; then
  TRIVY_BIN="$(where trivy 2>/dev/null | head -n 1 | tr -d '\r')"
fi

if [[ -z "$TRIVY_BIN" ]]; then
  echo "⚠️ Trivy not installed. Run ./scripts/setup.sh"
  exit 1
fi

# Run vulnerability scan
trivy image \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  --no-progress \
  "$IMAGE"

echo "✅ Security scan PASSED for $IMAGE"

# Run scan
"$TRIVY" image --severity HIGH,CRITICAL --exit-code 1 --no-progress "$IMAGE"

echo "✅ Security scan PASSED for $IMAGE"
