#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
TAG="${2:-latest}"

echo "🔒 Running security scan for $SERVICE:$TAG"

IMAGE="$SERVICE:$TAG"

# Ensure Docker exists
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
if ! command -v trivy >/dev/null 2>&1; then
  echo "⚠️ Trivy not installed, skipping security scan"
  exit 0
fi

# Run vulnerability scan
trivy image --severity HIGH,CRITICAL --exit-code 1 --no-progress "$IMAGE"

echo "✅ Security scan PASSED for $SERVICE:$TAG"
