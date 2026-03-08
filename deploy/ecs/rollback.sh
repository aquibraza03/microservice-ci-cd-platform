#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Service required}"

SERVICES_DIR="${SERVICES_DIR:-services}"
DEPLOY_DIR="${DEPLOY_DIR:-deploy}"

AWS_REGION="${AWS_REGION:-us-east-1}"
ECS_CLUSTER="${ECS_CLUSTER:-microservices}"
ECS_SERVICE="${ECS_SERVICE:-$SERVICE}"

############################################
# Helpers
############################################

log() {
  echo "[ROLLBACK/$SERVICE] $*"
}

fail() {
  echo "[ROLLBACK/$SERVICE] ❌ $*" >&2
  exit 1
}

command -v aws >/dev/null || fail "aws CLI not installed"

############################################
# Validation
############################################

aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION" >/dev/null \
  || fail "Service not found: $ECS_SERVICE"

############################################
# Rollback Logic
############################################

log "Restarting last stable deployment"
log "Cluster: $ECS_CLUSTER"
log "Region:  $AWS_REGION"

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment \
  --region "$AWS_REGION" || fail "Rollback trigger failed"

log "Waiting for service stability..."

aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION"

log "✅ Rollback complete: $ECS_SERVICE"
