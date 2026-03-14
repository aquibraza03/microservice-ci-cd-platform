#!/usr/bin/env bash
set -Eeuo pipefail

############################################
# Config
############################################

SERVICE="${1:?Service required}"
SERVICES_DIR="${SERVICES_DIR:-services}"
DEPLOY_DIR="${DEPLOY_DIR:-deploy}"

AWS_REGION="${AWS_REGION:?AWS_REGION required}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID required}"

ECS_CLUSTER="${ECS_CLUSTER:?ECS_CLUSTER required}"
ECS_SERVICE="${ECS_SERVICE:-$SERVICE}"

IMAGE_REGISTRY="${IMAGE_REGISTRY:?IMAGE_REGISTRY required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"

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

# Validate AWS credentials
aws sts get-caller-identity >/dev/null 2>&1 \
  || fail "AWS credentials not configured"

############################################
# Validate ECS Cluster
############################################

aws ecs describe-clusters \
  --clusters "$ECS_CLUSTER" \
  --region "$AWS_REGION" \
  --query 'clusters[0].status' \
  --output text >/dev/null \
  || fail "ECS cluster not found: $ECS_CLUSTER"

############################################
# Build Task Definition
############################################

TEMPLATE="${DEPLOY_DIR}/ecs/taskdef-template.json"
[[ -f "$TEMPLATE" ]] || fail "Task definition template missing: $TEMPLATE"

log "Building task definition"

# Windows-safe temp file
TMPDIR="${TMPDIR:-/c/temp}"
mkdir -p "$TMPDIR"

TASK_FILE="$(mktemp "$TMPDIR/taskdef-$SERVICE-XXXX.json")"

jq \
  --arg IMAGE "$IMAGE_REGISTRY/$SERVICE:$IMAGE_TAG" \
  --arg AWS_ACCOUNT_ID "$AWS_ACCOUNT_ID" \
  --arg AWS_REGION "$AWS_REGION" \
  --arg SERVICE "$SERVICE" \
  '
    .containerDefinitions[0].image = $IMAGE |
    .executionRoleArn = ("arn:aws:iam::" + $AWS_ACCOUNT_ID + ":role/ecsTaskExecutionRole") |
    .taskRoleArn = ("arn:aws:iam::" + $AWS_ACCOUNT_ID + ":role/ecsTaskRole") |
    .containerDefinitions[0].logConfiguration.options."awslogs-region" = $AWS_REGION |
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
  --force-new-deployment \
  >/dev/null

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

