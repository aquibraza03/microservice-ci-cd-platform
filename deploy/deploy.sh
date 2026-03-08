#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Usage: $0 <service-name> <ecs|k8s>}"
TARGET="${2:?Deployment target required (ecs|k8s)}"

SERVICES_DIR="${SERVICES_DIR:-services}"  # Added for service validation
DEPLOY_DIR="${DEPLOY_DIR:-deploy}"
CI_BUILD_ID="${CI_BUILD_ID:-${GITHUB_RUN_ID:-${BUILD_NUMBER:-local}}}"

############################################
# Helpers
############################################

log() {
  echo "[DEPLOY/$SERVICE/$CI_BUILD_ID] $*"
}

warn() {
  echo "[DEPLOY/$SERVICE/$CI_BUILD_ID] ⚠ $*" >&2
}

fail() {
  echo "[DEPLOY/$SERVICE/$CI_BUILD_ID] ❌ $*" >&2
  exit 1
}

require_dir() {
  [[ -d "$1" ]] || fail "$2"
}

############################################
# Validation
############################################

require_dir "${SERVICES_DIR}/${SERVICE}" "Service directory not found: ${SERVICES_DIR}/${SERVICE}"
require_dir "$DEPLOY_DIR" "Deploy directory not found: $DEPLOY_DIR"

log "Deploying $SERVICE → $TARGET"
echo

############################################
# Deployment Router
############################################

case "$TARGET" in
  ecs)
    SCRIPT="$DEPLOY_DIR/ecs/deploy.sh"
    ;;
  k8s|kubernetes)
    SCRIPT="$DEPLOY_DIR/k8s/deploy.sh"
    ;;
  *)
    fail "Unknown deployment target: $TARGET (use: ecs|k8s)"
    ;;
esac

[[ -f "$SCRIPT" ]] || fail "Deployment script missing: $SCRIPT"

############################################
# Execute Deployment
############################################

log "Executing: $SCRIPT $SERVICE"
if bash "$SCRIPT" "$SERVICE"; then
  log "✅ Deployment successful: $SERVICE → $TARGET"
else
  fail "Deployment failed: $SCRIPT $SERVICE"
fi

echo
log "✅ Deployment pipeline completed"
