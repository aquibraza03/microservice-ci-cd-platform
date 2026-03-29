#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Usage: $0 <service-name> <provider> [environment]}"
PROVIDER="${2:?Provider required (aws|k8s|local)}"
ENVIRONMENT="${3:-${ENVIRONMENT:-dev}}"

SERVICES_DIR="${SERVICES_DIR:-services}"
DEPLOY_DIR="${DEPLOY_DIR:-deploy}"
ENV_DIR="${DEPLOY_DIR}/environments"
PROVIDERS_DIR="${DEPLOY_DIR}/providers"

CI_BUILD_ID="${CI_BUILD_ID:-${GITHUB_RUN_ID:-${BUILD_NUMBER:-local}}}"

############################################
# Helpers
############################################

log() {
  echo "[DEPLOY/$SERVICE/$ENVIRONMENT/$PROVIDER/$CI_BUILD_ID] $*"
}

warn() {
  echo "[DEPLOY/$SERVICE/$ENVIRONMENT/$PROVIDER/$CI_BUILD_ID] ⚠ $*" >&2
}

fail() {
  echo "[DEPLOY/$SERVICE/$ENVIRONMENT/$PROVIDER/$CI_BUILD_ID] ❌ $*" >&2
  exit 1
}

require_dir() {
  [[ -d "$1" ]] || fail "$2"
}

require_file() {
  [[ -f "$1" ]] || fail "$2"
}

############################################
# Validation
############################################

require_dir "${SERVICES_DIR}/${SERVICE}" "Service directory not found: ${SERVICES_DIR}/${SERVICE}"
require_dir "$DEPLOY_DIR" "Deploy directory not found: $DEPLOY_DIR"
require_dir "$ENV_DIR" "Environment directory missing: $ENV_DIR"
require_dir "$PROVIDERS_DIR" "Providers directory missing: $PROVIDERS_DIR"

ENV_FILE="${ENV_DIR}/${ENVIRONMENT}.env"

require_file "$ENV_FILE" "Environment config not found: $ENV_FILE"

############################################
# Load Environment
############################################

log "Loading environment configuration: $ENV_FILE"

set -o allexport
source "$ENV_FILE"
set +o allexport

############################################
# Resolve Provider
############################################

SCRIPT="${PROVIDERS_DIR}/${PROVIDER}.sh"

if [[ ! -f "$SCRIPT" ]]; then
  fail "Unknown provider: $PROVIDER (expected script: $SCRIPT)"
fi

############################################
# Execute Deployment
############################################

log "Deploying $SERVICE → $PROVIDER ($ENVIRONMENT)"
echo

log "Executing: $SCRIPT $SERVICE"

if bash "$SCRIPT" "$SERVICE"; then
  log "✅ Deployment successful: $SERVICE → $PROVIDER ($ENVIRONMENT)"
else
  fail "Deployment failed: $SCRIPT $SERVICE"
fi

echo
log "✅ Deployment pipeline completed"
