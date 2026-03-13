#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Docker Buildx Bootstrap
# Enterprise CI/CD Ready
############################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BUILDER_NAME="${BUILDER_NAME:-platform-builder}"
PLATFORM_LIST="${PLATFORM_LIST:-linux/amd64,linux/arm64}"
DRIVER="${BUILDER_DRIVER:-docker-container}"

CI="${CI:-false}"
ENABLE_QEMU="${ENABLE_QEMU:-false}"

############################################
# Logging
############################################

log() {
  printf "\n[%s] %s\n" "$(date +'%Y-%m-%d %H:%M:%S')" "$1"
}

fail() {
  echo "❌ $1" >&2
  exit 1
}

############################################
# Dependency Checks
############################################

check_dependencies() {

  command -v docker >/dev/null 2>&1 || fail "Docker not installed"

  docker info >/dev/null 2>&1 || fail "Docker daemon not running"

  docker buildx version >/dev/null 2>&1 || fail "Docker Buildx required"

}

############################################
# Detect Docker Context
############################################

detect_context() {

  DOCKER_CONTEXT="$(docker context show 2>/dev/null || echo default)"

  log "Docker context: $DOCKER_CONTEXT"

}

############################################
# Enable QEMU
############################################

enable_qemu() {

  if [[ "$ENABLE_QEMU" != "true" ]]; then
    return
  fi

  log "Checking QEMU support"

  docker run --privileged --rm tonistiigi/binfmt --install all >/dev/null

  log "QEMU enabled for multi-arch builds"

}

############################################
# Cleanup CI builders
############################################

cleanup_old_builders() {

  if [[ "$CI" != "true" ]]; then
    return
  fi

  log "Cleaning unused builders"

  docker buildx ls --format '{{.Name}}' \
    | grep "platform-builder" \
    | grep -v "^${BUILDER_NAME}$" \
    | xargs -r docker buildx rm >/dev/null 2>&1 || true

}

############################################
# Create or reuse builder
############################################

create_builder() {

  if docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then

    log "Using existing builder: $BUILDER_NAME"

    docker buildx use "$BUILDER_NAME"

  else

    log "Creating builder: $BUILDER_NAME"
    log "Driver: $DRIVER"
    log "Platforms: $PLATFORM_LIST"

    docker buildx create \
      --name "$BUILDER_NAME" \
      --driver "$DRIVER" \
      --platform "$PLATFORM_LIST" \
      --use \
      "$DOCKER_CONTEXT"

  fi

}

############################################
# Bootstrap builder
############################################

bootstrap_builder() {

  log "Bootstrapping builder"

  docker buildx inspect "$BUILDER_NAME" --bootstrap >/dev/null

}

############################################
# Show builder info
############################################

print_builder_info() {

  log "Builder status"

  docker buildx inspect "$BUILDER_NAME"

}

############################################
# Main
############################################

main() {

  log "=== Docker Buildx Bootstrap ==="

  check_dependencies
  detect_context
  cleanup_old_builders
  enable_qemu
  create_builder
  bootstrap_builder
  print_builder_info

  log "Buildx ready"

  echo
  echo "Builder : $BUILDER_NAME"
  echo "Driver  : $DRIVER"
  echo "Platforms : $PLATFORM_LIST"
  echo

}

main "$@"

