#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Service name required}"
SERVICES_DIR="${SERVICES_DIR:-services}"
SERVICE_DIR="${SERVICES_DIR}/${SERVICE}"
CI_BUILD_ID="${CI_BUILD_ID:-${GITHUB_RUN_ID:-${BUILD_NUMBER:-unknownbuild}}}"

############################################
# Helpers
############################################

log() {
  echo "[POLICY/$SERVICE/$CI_BUILD_ID] $*"
}

warn() {
  echo "[POLICY/$SERVICE/$CI_BUILD_ID] ⚠ $*" >&2
}

fail() {
  echo "[POLICY/$SERVICE/$CI_BUILD_ID] ❌ $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "$2"
}

require_dir() {
  [[ -d "$1" ]] || fail "$2"
}

############################################
# Matrix Mode (CI service matrix)
############################################

if [[ -n "${CI_SERVICE_LIST:-}" ]]; then
  IFS=',' read -ra services <<< "$CI_SERVICE_LIST"

  log "Matrix mode: validating ${#services[@]} services"

  for svc in "${services[@]}"; do
    "${BASH_SOURCE[0]}" "$svc"
  done

  exit 0
fi

############################################
# Core Validation
############################################

log "Validating service: $SERVICE"

require_dir "$SERVICE_DIR" "Service directory missing: $SERVICE_DIR"
require_file "$SERVICE_DIR/service.yml" "service.yml required"
require_file "$SERVICE_DIR/Dockerfile" "Dockerfile required"
require_dir "$SERVICE_DIR/src" "src directory required"

############################################
# Service-Type Checks
############################################

# Node.js service
if [[ -f "$SERVICE_DIR/package.json" ]]; then
  grep -q '"scripts"' "$SERVICE_DIR/package.json" || warn "package.json missing scripts"
fi

# Python service detection
if [[ -f "$SERVICE_DIR/requirements.txt" || \
      -f "$SERVICE_DIR/Pipfile" || \
      -f "$SERVICE_DIR/pyproject.toml" ]]; then
  log "Python service detected"
fi

############################################
# Quality Gates
############################################

# src must not be empty
shopt -s nullglob dotglob
files=("$SERVICE_DIR/src"/*)
(( ${#files[@]} )) || fail "src directory empty: $SERVICE_DIR/src"
shopt -u nullglob dotglob

# Dockerfile must contain FROM
grep -Eq '^[[:space:]]*FROM[[:space:]]' "$SERVICE_DIR/Dockerfile" || \
  fail "Dockerfile missing FROM instruction"

# YAML validation
if command -v yq >/dev/null 2>&1; then
  yq e '.' "$SERVICE_DIR/service.yml" >/dev/null 2>&1 || \
    fail "Invalid YAML in service.yml"
else
  warn "yq unavailable, skipping YAML validation"
fi

# .dockerignore recommended
[[ -f "$SERVICE_DIR/.dockerignore" ]] || warn ".dockerignore recommended"

############################################
# Success
############################################

log "✅ $SERVICE passed all policy checks"
