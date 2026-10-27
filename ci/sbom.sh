#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
SERVICE_PATH="services/$SERVICE"
IMAGE_TAG="microservice-ci-cd/$SERVICE:${GITHUB_SHA:-local}"

SBOM_DIR="artifacts/sbom"
SBOM_JSON="$SBOM_DIR/$SERVICE.cyclonedx.json"
SBOM_SPDX="$SBOM_DIR/$SERVICE.spdx.json"

if command -v syft >/dev/null 2>&1; then
  SYFT="$(command -v syft)"
elif [ -x "./bin/syft" ]; then
  SYFT="./bin/syft"
else
  echo "Syft not found. Install via: curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin"
  exit 1
fi

if [[ ! -f "$SERVICE_PATH/Dockerfile" ]]; then
  echo "Dockerfile missing: $SERVICE_PATH/Dockerfile"
  exit 1
fi

mkdir -p "$SBOM_DIR"

if ! docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  echo "Building image $IMAGE_TAG"
  docker build -t "$IMAGE_TAG" "$SERVICE_PATH"
else
  echo "Using existing image $IMAGE_TAG"
fi

echo "Generating SBOM (CycloneDX) with Syft"
$SYFT "$IMAGE_TAG" -o cyclonedx-json > "$SBOM_JSON"

echo "Generating SBOM (SPDX) with Syft"
$SYFT "$IMAGE_TAG" -o spdx-json > "$SBOM_SPDX"

if [[ ! -s "$SBOM_JSON" ]]; then
  echo "SBOM generation failed (CycloneDX)"
  docker rmi "$IMAGE_TAG" >/dev/null 2>&1 || true
  exit 1
fi

if [[ ! -s "$SBOM_SPDX" ]]; then
  echo "SBOM generation failed (SPDX)"
  docker rmi "$IMAGE_TAG" >/dev/null 2>&1 || true
  exit 1
fi

echo "Cleaning up image"
docker rmi "$IMAGE_TAG" >/dev/null 2>&1 || true

echo "SBOM generated:"
echo "  $SBOM_JSON ($(du -h "$SBOM_JSON" | cut -f1))"
echo "  $SBOM_SPDX ($(du -h "$SBOM_SPDX" | cut -f1))"
