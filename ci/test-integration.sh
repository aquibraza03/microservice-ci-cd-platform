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
  echo "[INTEGRATION/$SERVICE/$CI_BUILD_ID] $*"
}

warn() {
  echo "[INTEGRATION/$SERVICE/$CI_BUILD_ID] ⚠ $*" >&2
}

fail() {
  echo "[INTEGRATION/$SERVICE/$CI_BUILD_ID] ❌ $*" >&2
  exit 1
}

require_dir() {
  [[ -d "$1" ]] || fail "$2"
}

############################################
# Validation
############################################

require_dir "$SERVICE_DIR" "Service directory not found: $SERVICE_DIR"

log "Running integration tests for $SERVICE"
echo

############################################
# Integration Test Execution
############################################

TEST_SCRIPT="$SERVICE_DIR/test/integration.sh"

if [[ -f "$TEST_SCRIPT" ]]; then
  log "Executing integration test script"

  if bash "$TEST_SCRIPT"; then
    log "✅ Integration tests passed"
  else
    fail "Integration tests failed"
  fi
else
  warn "No integration tests found — skipping"
fi

echo
log "✅ Integration test stage completed for $SERVICE"
