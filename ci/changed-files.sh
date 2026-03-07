#!/usr/bin/env bash
set -euo pipefail

# Detect changed files - Jenkins + GitHub Actions + First/Merge commit support
BASE_REF="${BASE_REF:-${GIT_PREVIOUS_COMMIT:-origin/${GITHUB_BASE_REF:-main}}}"
HEAD_REF="${HEAD_REF:-${GIT_COMMIT:-HEAD}}"

echo "🔍 Detecting changed files: $BASE_REF...$HEAD_REF"

# Ensure git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Not a git repository" >&2
  exit 1
fi

# First commit fallback
if [[ -z "$BASE_REF" || "$BASE_REF" == "origin/main" ]]; then
  FIRST_COMMIT=$(git rev-list --max-parents=0 HEAD 2>/dev/null | head -n1)
  [[ -n "$FIRST_COMMIT" ]] && BASE_REF="$FIRST_COMMIT"
fi

# MERGE COMMIT HANDLING: Ensure BASE_REF exists, fallback to merge-base
if ! git rev-parse "$BASE_REF" >/dev/null 2>&1; then
  echo "⚠️  BASE_REF '$BASE_REF' not found, using merge-base..."
  BASE_REF=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
  [[ -z "$BASE_REF" ]] && BASE_REF=$(git rev-list --max-parents=0 HEAD | head -n1)
fi

# Fetch base ref if remote
if [[ "$BASE_REF" == origin/* ]]; then
  git fetch origin "$(basename "$BASE_REF")" >/dev/null 2>&1 || true
fi

# Get changed files
changed_files=$(git diff --name-only "$BASE_REF" "$HEAD_REF" 2>/dev/null || echo "")

if [[ -z "$changed_files" ]]; then
  echo "ℹ️  No files changed"
  exit 0
fi

# Output with normalized line endings (Windows CI safe)
echo "$changed_files" | tr -d '\r'
