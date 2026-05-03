#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -x "$ROOT_DIR/bin/yq" ]; then
  YQ="$ROOT_DIR/bin/yq"
elif [ -x "$ROOT_DIR/bin/yq.exe" ]; then
  YQ="$ROOT_DIR/bin/yq.exe"
else
  YQ="$(command -v yq || true)"
fi

if [ -z "${YQ:-}" ]; then
  echo "yq not found. Install it or place it in ./bin/yq"
  exit 1
fi

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

get_yaml_value() {
  local file="$1"
  shift

  for key in "$@"; do
    value=$("$YQ" -r "$key // \"\"" "$file" 2>/dev/null || echo "")
    if [ -n "$value" ] && [ "$value" != "null" ]; then
      echo "$value"
      return 0
    fi
  done

  echo ""
}

PORT=$(get_yaml_value service.yml '.docker.port' '.container.port' '.port')
HEALTH=$(get_yaml_value service.yml '.deploy.healthcheck' '.healthcheck.path' '.health.path')
DOCKERFILE=$(get_yaml_value service.yml '.build.dockerfile' '.dockerfile')
DOCKERFILE="${DOCKERFILE:-Dockerfile}"

if [ -z "$PORT" ]; then
  echo "Service port missing in service.yml"
  exit 1
fi

if [ -z "$HEALTH" ]; then
  echo "Healthcheck path missing in service.yml"
  exit 1
fi

if [ ! -f "$DOCKERFILE" ]; then
  echo "Dockerfile not found: $SERVICE_PATH/$DOCKERFILE"
  exit 1
fi

IMAGE="${REGISTRY:+$REGISTRY/}$SERVICE:$TAG"
LATEST_IMAGE="${REGISTRY:+$REGISTRY/}$SERVICE:latest"

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
    --tag "$LATEST_IMAGE"
    --file "$DOCKERFILE"
    --build-arg "SERVICE_NAME=$SERVICE"
    --build-arg "SERVICE_PORT=$PORT"
  )

  if [ "$PUSH_IMAGE" = "true" ]; then
    BUILD_ARGS+=(--push)
  elif [[ "$PLATFORMS" != *,* ]]; then
    BUILD_ARGS+=(--load)
  else
    echo "Multi-platform local builds cannot use --load. Set PUSH_IMAGE=true or use a single platform."
    exit 1
  fi

  BUILD_ARGS+=(.)
  docker buildx "${BUILD_ARGS[@]}"
else
  docker build \
    --tag "$IMAGE" \
    --tag "$LATEST_IMAGE" \
    --file "$DOCKERFILE" \
    --build-arg "SERVICE_NAME=$SERVICE" \
    --build-arg "SERVICE_PORT=$PORT" \
    .
fi

echo "Build completed for $SERVICE"
