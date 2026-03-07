#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (works in GitHub Actions, Jenkins, local)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ensure yq exists (prefer local ./bin/yq if present)
if [ -x "$ROOT_DIR/bin/yq" ]; then
  YQ="$ROOT_DIR/bin/yq"
else
  YQ="$(command -v yq || true)"
fi

if [ -z "${YQ:-}" ]; then
  echo "❌ yq not found. Install it or place it in ./bin/yq"
  exit 1
fi

SERVICE="${1:?Usage: $0 <service-name>}"
TAG="${2:-latest}"
REGISTRY="${REGISTRY:-}"

SERVICE_PATH="$ROOT_DIR/services/$SERVICE"

# Check if service exists
if [ ! -d "$SERVICE_PATH" ]; then
  echo "❌ Service not found: $SERVICE"
  exit 1
fi

cd "$SERVICE_PATH"

# Read configuration from service.yml
PORT=$("$YQ" '.docker.port' service.yml)
HEALTH=$("$YQ" '.deploy.healthcheck' service.yml)

IMAGE="${REGISTRY:+$REGISTRY/}$SERVICE:$TAG"

echo "🐳 Building $IMAGE"
echo "Service port: $PORT"
echo "Healthcheck endpoint: $HEALTH"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag "$IMAGE" \
  --tag "${REGISTRY:+$REGISTRY/}$SERVICE:latest" \
  --build-arg PORT="$PORT" \
  --load .

echo "✅ Build completed for $SERVICE"
