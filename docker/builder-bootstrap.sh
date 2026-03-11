#!/usr/bin/env bash
set -Eeuo pipefail  # ✅ Fixed: was missing -E

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BUILDER_NAME="${BUILDER_NAME:-platform-builder}"
PLATFORM_LIST="${PLATFORM_LIST:-linux/amd64}"  # Documented but unused
DRIVER="${BUILDER_DRIVER:-docker-container}"

log() {
  printf "\n[%s] %s\n" "$(date +'%Y-%m-%d %H:%M:%S')" "$1"
}

check_dependencies() {
  command -v docker >/dev/null 2>&1 || {
    echo "❌ Docker required but not installed" >&2
    exit 1
  }

  docker buildx version >/dev/null 2>&1 || {
    echo "❌ Docker Buildx required" >&2
    exit 1
  }
}

create_builder() {
  if docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    log "Builder exists: $BUILDER_NAME"
    docker buildx use "$BUILDER_NAME"  # ✅ Added: Ensure active
  else
    log "Creating builder: $BUILDER_NAME"
    docker buildx create \
      --name "$BUILDER_NAME" \
      --driver "$DRIVER" \
      --use
  fi
}

bootstrap_builder() {
  log "Bootstrapping builder"
  docker buildx inspect "$BUILDER_NAME" --bootstrap
}

enable_qemu() {
  if [[ "${ENABLE_QEMU:-false}" == "true" ]]; then
    log "Enabling QEMU multi-arch"
    docker run --rm --privileged tonistiigi/binfmt --install all
  fi
}

print_builder_info() {
  log "Builder status:"
  docker buildx ls | grep "$BUILDER_NAME"  # ✅ Focused output
}

cleanup_old_builders() {  # ✅ Added: CI hygiene
  if [[ "${CI:-false}" == "true" ]]; then
    docker buildx ls --quiet | grep -v "$BUILDER_NAME" | xargs -r docker buildx rm
  fi
}

main() {
  log "=== Docker Buildx Bootstrap ==="

  check_dependencies
  cleanup_old_builders
  enable_qemu
  create_builder
  bootstrap_builder
  print_builder_info

  log "✅ Buildx ready for multi-arch builds"
  echo "Builder: $BUILDER_NAME (platforms: $PLATFORM_LIST)"
}

main "$@"
