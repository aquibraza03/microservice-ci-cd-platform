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

# Check if image exists
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "⚠️ Image $IMAGE not found locally, skipping scan"
  exit 0
fi

# Find Trivy
TRIVY=$(command -v trivy || true)

if [[ -z "$TRIVY" && -f "./bin/trivy.exe" ]]; then
  TRIVY="./bin/trivy.exe"
fi

if [[ -z "$TRIVY" ]]; then
  echo "⚠️ Trivy not installed. Run scripts/setup.sh"
  exit 0
fi

# Run scan
"$TRIVY" image --severity HIGH,CRITICAL --exit-code 1 --no-progress "$IMAGE"

echo "✅ Security scan PASSED for $IMAGE"
