#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:-}"
TAG="${2:-latest}"
MODE="${3:-load}"   # load | push
BUILDER="multiarch-builder"
SERVICES_DIR="services"

############################################
# Colors (disable if not TTY)
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
# Validate input
############################################

if [[ -z "$SERVICE" ]]; then
  err "Usage: $0 <service-name> [tag] [load|push]"
  exit 1
fi

if [[ "$MODE" != "load" && "$MODE" != "push" ]]; then
  err "Mode must be 'load' or 'push'"
  exit 1
fi

SERVICE_PATH="${SERVICES_DIR}/${SERVICE}"
IMAGE="local/${SERVICE}:${TAG}"

if [[ ! -d "$SERVICE_PATH" ]]; then
  err "Service not found: $SERVICE_PATH"
  exit 1
fi

if [[ ! -f "$SERVICE_PATH/Dockerfile" ]]; then
  err "Dockerfile missing: $SERVICE_PATH/Dockerfile"
  exit 1
fi

############################################
# Check Docker
############################################

command -v docker >/dev/null || {
  err "Docker not installed"
  exit 1
}

if ! docker buildx version >/dev/null 2>&1; then
  err "Docker buildx not available"
  exit 1
fi

############################################
# Setup builder
############################################

if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  log "Creating builder: $BUILDER"
  docker buildx create \
    --name "$BUILDER" \
    --driver docker-container \
    --use
else
  log "Using existing builder: $BUILDER"
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
# Git metadata
############################################

IMAGE_SHA=""

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_SHA=$(git rev-parse --short HEAD)
  IMAGE_SHA="local/${SERVICE}:${GIT_SHA}"
else
  warn "Git repo not detected, skipping SHA tag"
fi

############################################
# Build
############################################

log "Building service: $SERVICE"
log "Image: $IMAGE"
log "Platform: $PLATFORM"
log "Mode: $MODE"

BUILD_CMD=(
  docker buildx build
  --platform "$PLATFORM"
  --progress=plain
  --build-arg BUILDKIT_INLINE_CACHE=1
  -t "$IMAGE"
)

if [[ -n "$IMAGE_SHA" ]]; then
  BUILD_CMD+=( -t "$IMAGE_SHA" )
fi

BUILD_CMD+=(
  --cache-from type=registry,ref="$IMAGE"
  --cache-to type=inline
  "$OUTPUT"
  "$SERVICE_PATH"
)

"${BUILD_CMD[@]}"

############################################
# Done
############################################

log "✅ Build completed"

echo
echo "Images built:"
echo "  $IMAGE"

if [[ -n "$IMAGE_SHA" ]]; then
  echo "  $IMAGE_SHA"
fi

echo
