#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:?Usage: $0 <service-name> [load|push] [image-prefix]}"
MODE="${2:-load}"
BUILDER="${BUILDER_NAME:-platform-builder}"
SERVICES_DIR="${SERVICES_DIR:-services}"
IMAGE_PREFIX="${3:-${IMAGE_PREFIX:-local}}"

if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}WARNING: $*${NC}"; }
err()  { echo -e "${RED}ERROR: $*${NC}" >&2; }

if [[ "$MODE" != "load" && "$MODE" != "push" ]]; then
  err "Mode must be 'load' or 'push'"
  exit 1
fi

SERVICE_PATH="${SERVICES_DIR}/${SERVICE}"
IMAGE="${IMAGE_PREFIX}/${SERVICE}"

if [[ ! -d "$SERVICE_PATH" ]]; then
  err "Service not found: $SERVICE_PATH"
  exit 1
fi

if [[ ! -f "$SERVICE_PATH/Dockerfile" ]]; then
  err "Dockerfile missing: $SERVICE_PATH/Dockerfile"
  exit 1
fi

command -v docker >/dev/null || { err "Docker not installed"; exit 1; }

if ! docker buildx version >/dev/null 2>&1; then
  err "Docker buildx not available"
  exit 1
fi

if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  log "Creating builder: $BUILDER"
  if ! docker buildx create --name "$BUILDER" --driver docker-container --use; then
    warn "Builder creation failed, falling back to default builder"
    docker buildx use default
  fi
else
  docker buildx use "$BUILDER"
fi

log "Bootstrapping builder"
docker buildx inspect --bootstrap >/dev/null

if [[ "$MODE" == "push" ]]; then
  PLATFORM="linux/amd64,linux/arm64"
  OUTPUT="--push"
else
  PLATFORM="linux/amd64"
  OUTPUT="--load"
fi

TAGS=()
TAGS+=("$IMAGE:$IMAGE_TAG")

if [[ -n "${IMAGE_TAG_LATEST:-}" ]]; then
  TAGS+=("$IMAGE:latest")
fi

TAG_ARGS=()
for TAG in "${TAGS[@]}"; do
  TAG_ARGS+=("-t" "$TAG")
done

log "Building service: $SERVICE"
log "Image: $IMAGE"
log "Platform: $PLATFORM"
log "Mode: $MODE"
log "Tags: ${TAGS[*]}"

docker buildx build \
  --platform "$PLATFORM" \
  --progress=plain \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  "${TAG_ARGS[@]}" \
  --cache-from type=registry,ref="$IMAGE:latest" \
  --cache-to type=inline \
  "$OUTPUT" \
  "$SERVICE_PATH"

log "Build completed"

echo
echo "Images built:"
for TAG in "${TAGS[@]}"; do
  echo "  $TAG"
done
echo
