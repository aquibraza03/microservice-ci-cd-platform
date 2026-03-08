#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"

# Environment driven configuration
SERVICE_NAME="${SERVICE_NAME:-$SERVICE}"
K8S_NAMESPACE="${K8S_NAMESPACE:-default}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:?IMAGE_REGISTRY required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"

# Optional flags (template friendly)
CREATE_NAMESPACE="${CREATE_NAMESPACE:-false}"

log() {
  echo "[K8S-DEPLOY/$SERVICE_NAME] $*"
}

# Check kubectl connectivity
check_cluster() {
  kubectl version --client >/dev/null || {
    echo "❌ kubectl not installed"
    exit 1
  }

  kubectl cluster-info >/dev/null 2>&1 || {
    echo "❌ Kubernetes cluster not reachable"
    exit 1
  }
}

# Optional namespace creation
ensure_namespace() {
  if [[ "$CREATE_NAMESPACE" == "true" ]]; then
    kubectl get namespace "$K8S_NAMESPACE" >/dev/null 2>&1 || {
      log "Creating namespace $K8S_NAMESPACE"
      kubectl create namespace "$K8S_NAMESPACE"
    }
  else
    log "Using namespace $K8S_NAMESPACE (creation disabled)"
  fi
}

# Apply manifests from template
deploy_manifests() {
  BASE_DIR="deploy/k8s/base"

  log "Rendering manifests"

  envsubst < "$BASE_DIR/deployment.yaml" | kubectl apply -n "$K8S_NAMESPACE" -f -
  envsubst < "$BASE_DIR/service.yaml" | kubectl apply -n "$K8S_NAMESPACE" -f -
}

# Wait for deployment
wait_for_rollout() {
  log "Waiting for rollout"

  kubectl rollout status deployment/"$SERVICE_NAME" \
    -n "$K8S_NAMESPACE" \
    --timeout=300s
}

main() {
  log "Deploying $SERVICE_NAME"

  check_cluster
  ensure_namespace
  deploy_manifests
  wait_for_rollout

  log "Deployment finished"
}

main "$@"

