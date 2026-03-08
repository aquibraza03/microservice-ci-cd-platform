#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Service required}"
SERVICES_DIR="${SERVICES_DIR:-services}"
DEPLOY_DIR="${DEPLOY_DIR:-deploy}"

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-123456789012}"
ECS_CLUSTER="${ECS_CLUSTER:-microservices}"
ECS_SERVICE="${ECS_SERVICE:-$SERVICE}"
IMAGE_PREFIX="${IMAGE_PREFIX:-local}"

############################################
# Helpers
############################################

log() {
  echo "[ECS/$SERVICE] $*"
}

fail() {
  echo "[ECS/$SERVICE] ❌ $*" >&2
  exit 1
}

############################################
# Dependency Check
############################################

command -v aws >/dev/null || fail "aws CLI not installed"
command -v jq >/dev/null || fail "jq not installed"

############################################
# Build Task Definition (Windows-safe + Full substitution)
############################################

TEMPLATE="${DEPLOY_DIR}/ecs/taskdef-template.json"
[[ -f "$TEMPLATE" ]] || fail "Task definition template missing: $TEMPLATE"

log "Building task definition"

# Windows-safe temp file
TMPDIR="${TMPDIR:-/c/temp}"
mkdir -p "$TMPDIR"
TASK_FILE="$TMPDIR/taskdef-$SERVICE-$$.json"

jq \
  --arg IMAGE "$IMAGE_PREFIX/$SERVICE:latest" \
  --arg AWS_ACCOUNT_ID "$AWS_ACCOUNT_ID" \
  --arg AWS_REGION "$AWS_REGION" \
  --arg SERVICE "$SERVICE" \
  '
    .containerDefinitions[0].image = $IMAGE |
    .executionRoleArn = ("arn:aws:iam::" + $AWS_ACCOUNT_ID + ":role/ecsTaskExecutionRole") |
    .taskRoleArn = ("arn:aws:iam::" + $AWS_ACCOUNT_ID + ":role/ecsTaskRole") |
    .logConfiguration.options."awslogs-region" = $AWS_REGION |
    (.tags[] | select(.key == "Service") | .value) = $SERVICE
  ' "$TEMPLATE" > "$TASK_FILE"

############################################
# Register Task Definition
############################################

log "Registering task definition"
TASK_ARN=$(aws ecs register-task-definition \
  --region "$AWS_REGION" \
  --cli-input-json "file://$TASK_FILE" \
  | jq -r '.taskDefinition.taskDefinitionArn')

[[ -n "$TASK_ARN" ]] || fail "Failed to register task definition"

############################################
# Update ECS Service
############################################

log "Updating ECS service: $ECS_SERVICE"
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$TASK_ARN" \
  --region "$AWS_REGION" \
  --force-new-deployment || fail "Service update failed"

############################################
# Wait for Stability
############################################

log "Waiting for service stability"
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION"

############################################
# Cleanup
############################################

rm -f "$TASK_FILE"
log "✅ ECS deployment complete: $SERVICE@${TASK_ARN##*/}"


