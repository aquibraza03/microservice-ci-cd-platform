#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Usage: $0 <service-name> [load|push] [image-prefix]}"
MODE="${2:-load}"            # load | push
BUILDER="multiarch-builder"
SERVICES_DIR="services"
IMAGE_PREFIX="${3:-${IMAGE_PREFIX:-local}}"

############################################
# Colors (disabled if not TTY)
############################################

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

############################################
# Helpers
############################################

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}" >&2; }

############################################
# Validate mode
############################################

if [[ "$MODE" != "load" && "$MODE" != "push" ]]; then
  err "Mode must be 'load' or 'push'"
  exit 1
fi

############################################
# Paths
############################################

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

############################################
# Dependency checks
############################################

command -v docker >/dev/null || {
  err "Docker not installed"
  exit 1
}

if ! docker buildx version >/dev/null 2>&1; then
  err "Docker buildx not available"
  exit 1
fi

if [[ ! -x ./ci/version.sh ]]; then
  err "ci/version.sh missing or not executable"
  exit 1
fi

############################################
# Setup builder
############################################

if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  log "Creating builder: $BUILDER"

  if ! docker buildx create \
    --name "$BUILDER" \
    --driver docker-container \
    --use; then

    warn "Builder creation failed, falling back to default builder"
    docker buildx use default
  fi
else
  docker buildx use "$BUILDER"
fi

log "Bootstrapping builder"
docker buildx inspect --bootstrap >/dev/null

############################################
# Platform selection
############################################

if [[ "$MODE" == "push" ]]; then
  PLATFORM="linux/amd64,linux/arm64"
  OUTPUT="--push"
else
  PLATFORM="linux/amd64"
  OUTPUT="--load"
fi

############################################
# Generate version tags
############################################

mapfile -t VERSION_TAGS < <(./ci/version.sh)

TAG_ARGS=()
for TAG in "${VERSION_TAGS[@]}"; do
  TAG_ARGS+=("-t" "$IMAGE:$TAG")
done

############################################
# Build
############################################

log "Building service: $SERVICE"
log "Image: $IMAGE"
log "Platform: $PLATFORM"
log "Mode: $MODE"
log "Tags: ${#VERSION_TAGS[@]} tags generated"

docker buildx build \
  --platform "$PLATFORM" \
  --progress=plain \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  "${TAG_ARGS[@]}" \
  --cache-from type=registry,ref="$IMAGE:latest" \
  --cache-to type=inline \
  "$OUTPUT" \
  "$SERVICE_PATH"

############################################
# Done
############################################

log "✅ Build completed"

echo
echo "Images built:"
for TAG in "${VERSION_TAGS[@]}"; do
  echo "  $IMAGE:$TAG"
done
echo

