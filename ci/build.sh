#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
TAG="${2:-latest}"
REGISTRY="${REGISTRY:-}"

SERVICE_PATH="services/$SERVICE"

# Check if service exists
if [ ! -d "$SERVICE_PATH" ]; then
  echo "❌ Service not found: $SERVICE"
  exit 1
fi

cd "$SERVICE_PATH"

# Read configuration from service.yml
PORT=$(yq '.docker.port' service.yml)
HEALTH=$(yq '.deploy.healthcheck' service.yml)

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
