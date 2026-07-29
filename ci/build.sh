#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SERVICE="${1:?Usage: $0 <service-name> [tag]}"
TAG="${2:-dev}"
REGISTRY="${REGISTRY:-}"
PLATFORMS="${PLATFORMS:-linux/amd64}"
PUSH_IMAGE="${PUSH_IMAGE:-false}"

SERVICE_PATH="$ROOT_DIR/services/$SERVICE"

if [ ! -d "$SERVICE_PATH" ]; then
  echo "Service not found: $SERVICE"
  exit 1
fi

cd "$SERVICE_PATH"

# yq is optional - try to use it, fall back to grep
PORT=""
HEALTH=""
DOCKERFILE=""

if command -v yq &>/dev/null; then
  PORT=$(yq -r '.docker.port // .container.port // .port // ""' service.yml 2>/dev/null || echo "")
  HEALTH=$(yq -r '.deploy.healthcheck // .healthcheck.path // .health.path // "/health"' service.yml 2>/dev/null || echo "/health")
  DOCKERFILE=$(yq -r '.build.dockerfile // .dockerfile // ""' service.yml 2>/dev/null || echo "")
elif [ -f service.yml ]; then
  PORT=$(grep -E '^port:|^  port:' service.yml | awk '{print $2}' | head -1 || echo "")
  HEALTH=$(grep -E '^healthcheck:|^  healthcheck:' service.yml | awk '{print $2}' | head -1 || echo "/health")
fi

DOCKERFILE="${DOCKERFILE:-Dockerfile}"

if [ -z "$PORT" ]; then
  PORT=3000
fi

if [ ! -f "$DOCKERFILE" ]; then
  echo "Dockerfile not found: $SERVICE_PATH/$DOCKERFILE"
  exit 1
fi

IMAGE="${REGISTRY:+$REGISTRY/}$SERVICE:$TAG"

echo "Building $IMAGE"
echo "Service port: $PORT"
echo "Healthcheck endpoint: $HEALTH"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable"
  exit 1
fi

if docker buildx version >/dev/null 2>&1; then
  BUILD_ARGS=(
    build
    --platform "$PLATFORMS"
    --tag "$IMAGE"
    --file "$DOCKERFILE"
    --build-arg "SERVICE_NAME=$SERVICE"
    --build-arg "SERVICE_PORT=$PORT"
    --build-arg "SERVICE_VERSION=$TAG"
    --cache-from type=gha
    --cache-to type=gha,mode=max
  )

  if [ "$PUSH_IMAGE" = "true" ]; then
    BUILD_ARGS+=(--push)
  elif [[ "$PLATFORMS" != *,* ]]; then
    BUILD_ARGS+=(--load)
  else
    echo "Multi-platform local builds cannot use --load. Set PUSH_IMAGE=true or use single platform."
    exit 1
  fi

  BUILD_ARGS+=(.)
  docker buildx "${BUILD_ARGS[@]}"
else
  docker build \
    --tag "$IMAGE" \
    --file "$DOCKERFILE" \
    --build-arg "SERVICE_NAME=$SERVICE" \
    --build-arg "SERVICE_PORT=$PORT" \
    --build-arg "SERVICE_VERSION=$TAG" \
    .
fi

echo "Build completed for $SERVICE"
