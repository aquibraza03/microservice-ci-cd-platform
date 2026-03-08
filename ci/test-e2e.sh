#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Usage: $0 <service-name>}"

SERVICES_DIR="${SERVICES_DIR:-services}"
SERVICE_DIR="${SERVICES_DIR}/${SERVICE}"

# CI detection (Jenkins + GitHub Actions + local)
CI_BUILD_ID="${CI_BUILD_ID:-${GITHUB_RUN_ID:-${BUILD_NUMBER:-local}}}"

############################################
# Helpers
############################################

log() {
  echo "[E2E/$SERVICE/$CI_BUILD_ID] $*"
}

warn() {
  echo "[E2E/$SERVICE/$CI_BUILD_ID] ⚠ $*" >&2
}

fail() {
  echo "[E2E/$SERVICE/$CI_BUILD_ID] ❌ $*" >&2
  exit 1
}

require_dir() {
  [[ -d "$1" ]] || fail "$2"
}

############################################
# Validation
############################################

require_dir "$SERVICE_DIR" "Service directory not found: $SERVICE_DIR"

log "Running end-to-end tests for $SERVICE"
echo

############################################
# Test Detection
############################################

E2E_SCRIPT="${SERVICE_DIR}/test/e2e.sh"

if [[ -f "$E2E_SCRIPT" ]]; then
  log "Executing E2E test script"

  if bash "$E2E_SCRIPT"; then
    log "✅ E2E tests passed"
  else
    fail "E2E tests failed"
  fi

else
  warn "No E2E tests found — skipping"
fi

echo
log "✅ E2E test stage completed for $SERVICE"
