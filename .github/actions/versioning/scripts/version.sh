#!/usr/bin/env bash
set -Eeuo pipefail

# ------------------------------------------------------------------------------
# Versioning Script
# Supports:
# - semantic versioning
# - tag discovery
# - auto bump from commit messages
# - prerelease versions
# - GitHub outputs
# ------------------------------------------------------------------------------

log() {
  echo "[versioning] $*"
}

fail() {
  echo "[versioning] ERROR: $*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

# ------------------------------------------------------------------------------
# Inputs (Environment Variables)
# ------------------------------------------------------------------------------

STRATEGY="${STRATEGY:-auto}"            # auto|patch|minor|major
PREFIX="${PREFIX:-v}"
PRERELEASE="${PRERELEASE:-false}"
PRERELEASE_SUFFIX="${PRERELEASE_SUFFIX:-rc}"
DEFAULT_VERSION="${DEFAULT_VERSION:-0.0.0}"

# ------------------------------------------------------------------------------
# Validate Runtime
# ------------------------------------------------------------------------------

require git

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not inside git repository"

# ------------------------------------------------------------------------------
# Fetch Tags
# ------------------------------------------------------------------------------

git fetch --tags --force >/dev/null 2>&1 || true

# ------------------------------------------------------------------------------
# Find Latest Tag
# ------------------------------------------------------------------------------

LAST_TAG="$(git tag --list "${PREFIX}*" --sort=-v:refname | head -1 || true)"

if [ -z "$LAST_TAG" ]; then
  LAST_TAG="${PREFIX}${DEFAULT_VERSION}"
fi

CURRENT_VERSION="${LAST_TAG#$PREFIX}"

# ------------------------------------------------------------------------------
# Parse Version
# ------------------------------------------------------------------------------

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

MAJOR="${MAJOR:-0}"
MINOR="${MINOR:-0}"
PATCH="${PATCH:-0}"

# ------------------------------------------------------------------------------
# Auto Strategy
# ------------------------------------------------------------------------------

if [ "$STRATEGY" = "auto" ]; then
  COMMIT_MSG="$(git log -1 --pretty=%B)"

  if echo "$COMMIT_MSG" | grep -q "BREAKING CHANGE"; then
    STRATEGY="major"
  elif echo "$COMMIT_MSG" | grep -Eq '^feat(\(|:)' ; then
    STRATEGY="minor"
  else
    STRATEGY="patch"
  fi
fi

# ------------------------------------------------------------------------------
# Calculate Next Version
# ------------------------------------------------------------------------------

case "$STRATEGY" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    fail "Invalid STRATEGY: $STRATEGY"
    ;;
esac

NEXT_VERSION="${MAJOR}.${MINOR}.${PATCH}"

# ------------------------------------------------------------------------------
# Optional Prerelease
# ------------------------------------------------------------------------------

if [ "$PRERELEASE" = "true" ]; then
  BUILD_COUNT="$(git rev-list --count HEAD)"
  NEXT_VERSION="${NEXT_VERSION}-${PRERELEASE_SUFFIX}.${BUILD_COUNT}"
fi

NEXT_TAG="${PREFIX}${NEXT_VERSION}"

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "current_tag=$LAST_TAG"
    echo "current_version=$CURRENT_VERSION"
    echo "next_tag=$NEXT_TAG"
    echo "next_version=$NEXT_VERSION"
    echo "bump_type=$STRATEGY"
  } >> "$GITHUB_OUTPUT"
fi

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Version Calculation Completed"
    echo "- Current Tag: $LAST_TAG"
    echo "- Current Version: $CURRENT_VERSION"
    echo "- Next Tag: $NEXT_TAG"
    echo "- Next Version: $NEXT_VERSION"
    echo "- Bump Type: $STRATEGY"
    echo "- Prerelease: $PRERELEASE"
  } >> "$GITHUB_STEP_SUMMARY"
fi

log "Calculated next version: $NEXT_TAG"
