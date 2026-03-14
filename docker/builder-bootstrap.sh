#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Docker Buildx Bootstrap Script
# Enterprise CI/CD Ready
# Compatible with:
#  - GitHub Actions
#  - Jenkins
#  - Local Development
############################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BUILDER_NAME="${BUILDER_NAME:-platform-builder}"
PLATFORM_LIST="${PLATFORM_LIST:-linux/amd64}"
DRIVER="${BUILDER_DRIVER:-docker-container}"

CI="${CI:-false}"
ENABLE_QEMU="${ENABLE_QEMU:-false}"

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

  command -v docker >/dev/null 2>&1 || fail "Docker required but not installed"

  docker info >/dev/null 2>&1 || fail "Docker daemon not running"

  docker buildx version >/dev/null 2>&1 || fail "Docker Buildx required"

}

############################################
# Detect Docker Context
############################################

sanitize_docker_env() {

  # Fix Docker Desktop / Git Bash TLS conflicts
  unset DOCKER_HOST || true
  unset DOCKER_TLS_VERIFY || true
  unset DOCKER_CERT_PATH || true

}

detect_context() {

  DOCKER_CONTEXT="$(docker context show 2>/dev/null || echo default)"

  log "Using Docker context: $DOCKER_CONTEXT"

}

############################################
# Enable QEMU for multi-arch builds
############################################

enable_qemu() {

  if [[ "$ENABLE_QEMU" == "true" ]]; then

    log "Enabling QEMU multi-arch emulation"

    docker run --rm --privileged tonistiigi/binfmt --install all >/dev/null

  fi

}

############################################
# Cleanup old builders in CI
############################################

cleanup_old_builders() {

  if [[ "$CI" == "true" ]]; then

    log "Cleaning old builders"

    docker buildx ls --format '{{.Name}}' \
      | grep -v "^${BUILDER_NAME}$" \
      | xargs -r docker buildx rm >/dev/null 2>&1 || true

  fi

}

############################################
# Create or reuse builder
############################################

create_builder() {

  if docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then

    log "Builder exists: $BUILDER_NAME"

    docker buildx use "$BUILDER_NAME"

  else

    log "Creating builder: $BUILDER_NAME"

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

  docker buildx ls | grep "$BUILDER_NAME" || true

}

############################################
# Main
############################################

main() {

  log "=== Docker Buildx Bootstrap ==="

  sanitize_docker_env
  check_dependencies
  detect_context
  cleanup_old_builders
  enable_qemu
  create_builder
  bootstrap_builder
  print_builder_info

  log "✅ Buildx ready"

  echo
  echo "Builder: $BUILDER_NAME"
  echo "Platforms: $PLATFORM_LIST"
  echo

}

main "$@"
