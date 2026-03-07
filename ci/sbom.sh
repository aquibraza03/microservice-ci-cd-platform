#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
SERVICE_PATH="services/$SERVICE"
IMAGE_TAG="microservice-ci-cd/$SERVICE:${GITHUB_SHA:-local}"

SBOM_DIR="artifacts/sbom"
SBOM_FILE="$SBOM_DIR/$SERVICE.json"
SYFT="./bin/syft.exe"

echo "🔎 Generating SBOM for $SERVICE"

# Check Syft exists
if [[ ! -f "$SYFT" ]]; then
  echo "❌ Syft not found at $SYFT"
  echo "Run scripts/setup.sh to install required tools."
  exit 1
fi

# Validate service exists
if [[ ! -f "$SERVICE_PATH/Dockerfile" ]]; then
  echo "❌ Dockerfile missing: $SERVICE_PATH/Dockerfile"
  exit 1
fi

# Ensure artifacts directory exists
mkdir -p "$SBOM_DIR"

# Build image only if not present
if ! docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  echo "🏗️ Building image $IMAGE_TAG"
  docker build -t "$IMAGE_TAG" "$SERVICE_PATH"
else
  echo "♻️ Using existing image $IMAGE_TAG"
fi

# Generate SBOM
echo "📋 Generating SBOM with Syft"
"$SYFT" "$IMAGE_TAG" -o cyclonedx-json > "$SBOM_FILE"

# Validate SBOM output
if [[ ! -s "$SBOM_FILE" ]]; then
  echo "❌ SBOM generation failed"
  exit 1
fi

# Cleanup image (optional)
echo "🧹 Cleaning up image $IMAGE_TAG"
docker rmi "$IMAGE_TAG" >/dev/null 2>&1 || true

echo "✅ SBOM generated successfully: $SBOM_FILE ($(du -h "$SBOM_FILE" | cut -f1))"
