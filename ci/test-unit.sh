#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Usage: $0 <service-name>}"
SERVICES_DIR="${SERVICES_DIR:-services}"
SERVICE_DIR="${SERVICES_DIR}/${SERVICE}"
CI_BUILD_ID="${CI_BUILD_ID:-${GITHUB_RUN_ID:-${BUILD_NUMBER:-local}}}"

############################################
# Helpers
############################################

log() {
  echo "[UNIT/$SERVICE/$CI_BUILD_ID] $*"
}

warn() {
  echo "[UNIT/$SERVICE/$CI_BUILD_ID] ⚠ $*" >&2
}

fail() {
  echo "[UNIT/$SERVICE/$CI_BUILD_ID] ❌ $*" >&2
  exit 1
}

require_dir() {
  [[ -d "$1" ]] || fail "$2"
}

############################################
# Validation
############################################

require_dir "$SERVICE_DIR" "Service directory not found: $SERVICE_DIR"

log "Running unit tests for $SERVICE"

############################################
# Node.js Unit Tests
############################################

if [[ -f "$SERVICE_DIR/package.json" ]]; then
  cd "$SERVICE_DIR" || fail "Cannot access service directory"

  log "Installing dependencies"
  npm ci --no-audit

  log "Running unit tests"
  if npm run test --if-present; then
    log "✅ Unit tests passed"
  else
    fail "Unit tests failed"
  fi
else
  warn "No Node.js project detected — skipping unit tests"
fi

############################################
# Success
############################################

log "✅ Unit test stage completed for $SERVICE"
