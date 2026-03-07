#!/usr/bin/env bash
set -euo pipefail

VERBOSE="${VERBOSE:-false}"

# -----------------------------
# Git metadata
# -----------------------------
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  COMMIT_SHA=$(git rev-parse --short HEAD)
  GIT_TAG=$(git tag --points-at HEAD 2>/dev/null | head -n1 || echo "")
else
  COMMIT_SHA="unknown"
  GIT_TAG=""
fi

# -----------------------------
# UTC timestamp (CI consistent)
# -----------------------------
DATE=$(date -u +%Y%m%dT%H%M%SZ)

# -----------------------------
# Language-agnostic version detection
# -----------------------------
SEMVER="0.0.0"

# Node.js
if [[ -f package.json ]] && command -v node >/dev/null 2>&1; then
  SEMVER=$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")

# Python
elif [[ -f pyproject.toml ]]; then
  SEMVER=$(grep -m1 -o 'version *= *"[^"]*"' pyproject.toml | cut -d'"' -f2 || echo "0.0.0")

# Rust
elif [[ -f Cargo.toml ]]; then
  SEMVER=$(grep -m1 -o 'version *= *"[^"]*"' Cargo.toml | cut -d'"' -f2 || echo "0.0.0")

# Go (most Go projects do not embed semver in go.mod)
elif [[ -f go.mod ]]; then
  SEMVER="0.1.0"
fi

# -----------------------------
# Generate tags
# -----------------------------
TAGS=()

TAGS+=("latest")
TAGS+=("$COMMIT_SHA")
TAGS+=("$DATE-$COMMIT_SHA")

if [[ -n "$GIT_TAG" ]]; then
  TAGS+=("$GIT_TAG")
fi

TAGS+=("v$SEMVER-$COMMIT_SHA")
TAGS+=("$SEMVER")

# Remove duplicates and normalize
UNIQUE_TAGS=$(printf '%s\n' "${TAGS[@]}" | LC_ALL=C sort -u | tr -d '\r')

# -----------------------------
# Machine-readable output
# -----------------------------
echo "$UNIQUE_TAGS"

# -----------------------------
# Optional verbose summary
# -----------------------------
if [[ "$VERBOSE" == "true" ]]; then
  echo
  echo "📦 Generated tags:"
  printf '  %s\n' $UNIQUE_TAGS
fi
