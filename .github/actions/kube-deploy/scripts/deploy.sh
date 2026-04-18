#!/usr/bin/env bash
set -Eeuo pipefail

# ------------------------------------------------------------------------------
# Kubernetes Deploy Script
# Supports:
# - namespace targeting
# - image update
# - rollout status checks
# - optional scaling
# - health endpoint verification
# - automatic rollback
# ------------------------------------------------------------------------------

log() {
  echo "[kube-deploy] $*"
}

fail() {
  echo "[kube-deploy] ERROR: $*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

# ------------------------------------------------------------------------------
# Required Environment Variables
# ------------------------------------------------------------------------------

: "${NAMESPACE:?NAMESPACE is required}"
: "${DEPLOYMENT:?DEPLOYMENT is required}"
: "${CONTAINER:?CONTAINER is required}"
: "${IMAGE:?IMAGE is required}"

TIMEOUT="${TIMEOUT:-300s}"
REPLICAS="${REPLICAS:-}"
HEALTH_URL="${HEALTH_URL:-}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"

# ------------------------------------------------------------------------------
# Validate Runtime
# ------------------------------------------------------------------------------

require kubectl

# ------------------------------------------------------------------------------
# Validate Kubernetes Access
# ------------------------------------------------------------------------------

log "Validating cluster access"

kubectl version --client
kubectl get namespace "$NAMESPACE" >/dev/null

# ------------------------------------------------------------------------------
# Capture Current Image
# ------------------------------------------------------------------------------

log "Capturing previous image"

PREVIOUS_IMAGE="$(
  kubectl -n "$NAMESPACE" \
    get deployment "$DEPLOYMENT" \
    -o jsonpath="{.spec.template.spec.containers[?(@.name==\"$CONTAINER\")].image}"
)"

[ -n "$PREVIOUS_IMAGE" ] || fail "Could not determine previous image"

# ------------------------------------------------------------------------------
# Optional Scale
# ------------------------------------------------------------------------------

if [ -n "$REPLICAS" ]; then
  log "Scaling deployment to $REPLICAS replicas"

  kubectl -n "$NAMESPACE" \
    scale deployment "$DEPLOYMENT" \
    --replicas="$REPLICAS"
fi

# ------------------------------------------------------------------------------
# Deploy New Image
# ------------------------------------------------------------------------------

log "Deploying image: $IMAGE"

kubectl -n "$NAMESPACE" \
  set image deployment/"$DEPLOYMENT" \
  "$CONTAINER=$IMAGE"

# ------------------------------------------------------------------------------
# Wait For Rollout
# ------------------------------------------------------------------------------

rollout_failed=false

if ! kubectl -n "$NAMESPACE" \
  rollout status deployment/"$DEPLOYMENT" \
  --timeout="$TIMEOUT"; then
  rollout_failed=true
fi

# ------------------------------------------------------------------------------
# HTTP Health Check
# ------------------------------------------------------------------------------

if [ "$rollout_failed" = false ] && [ -n "$HEALTH_URL" ]; then
  log "Running health check: $HEALTH_URL"

  healthy=false

  for i in $(seq 1 20); do
    CODE="$(curl -ks -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)"

    if [ "$CODE" = "200" ]; then
      healthy=true
      break
    fi

    sleep 5
  done

  if [ "$healthy" = false ]; then
    rollout_failed=true
  fi
fi

# ------------------------------------------------------------------------------
# Rollback
# ------------------------------------------------------------------------------

if [ "$rollout_failed" = true ]; then
  log "Deployment failed"

  if [ "$ROLLBACK_ON_FAILURE" = "true" ]; then
    log "Rolling back to previous image: $PREVIOUS_IMAGE"

    kubectl -n "$NAMESPACE" \
      set image deployment/"$DEPLOYMENT" \
      "$CONTAINER=$PREVIOUS_IMAGE"

    kubectl -n "$NAMESPACE" \
      rollout status deployment/"$DEPLOYMENT" \
      --timeout="$TIMEOUT"
  fi

  fail "Deployment failed"
fi

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "deployed_image=$IMAGE"
    echo "previous_image=$PREVIOUS_IMAGE"
    echo "namespace=$NAMESPACE"
  } >> "$GITHUB_OUTPUT"
fi

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Kubernetes Deployment Successful"
    echo "- Namespace: $NAMESPACE"
    echo "- Deployment: $DEPLOYMENT"
    echo "- Container: $CONTAINER"
    echo "- New Image: $IMAGE"
    echo "- Previous Image: $PREVIOUS_IMAGE"
    echo "- Timeout: $TIMEOUT"
  } >> "$GITHUB_STEP_SUMMARY"
fi

log "Deployment completed successfully"
