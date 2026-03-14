#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"

############################################
# Local override support (developer testing)
############################################

LOCAL_ENV_FILE=".env.local"

if [[ -f "$LOCAL_ENV_FILE" ]]; then
  echo "🧪 Loading local overrides from $LOCAL_ENV_FILE"
  set -a
  source "$LOCAL_ENV_FILE"
  set +a
fi

############################################
# Environment driven configuration
############################################

SERVICE_NAME="${SERVICE_NAME:-$SERVICE}"
K8S_NAMESPACE="${K8S_NAMESPACE:-default}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:?IMAGE_REGISTRY required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"

SERVICE_PORT="${SERVICE_PORT:-80}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
REPLICAS="${REPLICAS:-1}"

# Deployment version (CI or timestamp)
DEPLOY_VERSION="${DEPLOY_VERSION:-$(date +%s)}"

CREATE_NAMESPACE="${CREATE_NAMESPACE:-false}"

############################################
# Logging helper
############################################

log() {
  echo "[K8S-DEPLOY/$SERVICE_NAME] $*"
}

############################################
# Check kubectl connectivity
############################################

check_cluster() {

  if ! command -v kubectl >/dev/null 2>&1; then
    echo "❌ kubectl not installed"
    exit 1
  fi

  if ! kubectl cluster-info >/dev/null 2>&1; then
    echo "❌ Kubernetes cluster not reachable"
    exit 1
  fi
}

############################################
# Optional namespace creation
############################################

ensure_namespace() {

  if [[ "$CREATE_NAMESPACE" == "true" ]]; then

    if ! kubectl get namespace "$K8S_NAMESPACE" >/dev/null 2>&1; then
      log "Creating namespace $K8S_NAMESPACE"
      kubectl create namespace "$K8S_NAMESPACE"
    fi

  else
    log "Using namespace $K8S_NAMESPACE (creation disabled)"
  fi
}

############################################
# Render and apply manifests
############################################

deploy_manifests() {

  BASE_DIR="deploy/k8s/base"

  log "Rendering manifests"

  export SERVICE_NAME
  export IMAGE_REGISTRY
  export IMAGE_TAG
  export K8S_NAMESPACE
  export SERVICE_PORT
  export CONTAINER_PORT
  export REPLICAS
  export DEPLOY_VERSION

  # Optional ConfigMap
  if [[ -f "$BASE_DIR/configmap.yaml" ]]; then
    envsubst < "$BASE_DIR/configmap.yaml" | kubectl apply -n "$K8S_NAMESPACE" -f -
  fi

  # Optional Secret
  if [[ -f "$BASE_DIR/secret.yaml" ]]; then
    envsubst < "$BASE_DIR/secret.yaml" | kubectl apply -n "$K8S_NAMESPACE" -f -
  fi

  # Deployment
  envsubst < "$BASE_DIR/deployment.yaml" | kubectl apply -n "$K8S_NAMESPACE" -f -

  # Service
  envsubst < "$BASE_DIR/service.yaml" | kubectl apply -n "$K8S_NAMESPACE" -f -
}

############################################
# Wait for rollout
############################################

wait_for_rollout() {

  log "Waiting for rollout"

  if ! kubectl rollout status deployment/"$SERVICE_NAME" \
      -n "$K8S_NAMESPACE" \
      --timeout=300s; then

    echo "❌ Deployment failed. Rolling back..."

    kubectl rollout undo deployment/"$SERVICE_NAME" \
      -n "$K8S_NAMESPACE"

    echo "🔁 Rolled back to previous version"

    exit 1
  fi
}

############################################
# Main execution
############################################

main() {

  log "Deploying $SERVICE_NAME"

  check_cluster

  # Optional AWS EKS kubeconfig setup
  if [[ -n "${AWS_REGION:-}" && -n "${K8S_CLUSTER_NAME:-}" ]]; then
    log "Configuring kubeconfig for EKS cluster ${K8S_CLUSTER_NAME}"
    aws eks update-kubeconfig \
      --name "${K8S_CLUSTER_NAME}" \
      --region "${AWS_REGION}"
  fi

  ensure_namespace
  deploy_manifests
  wait_for_rollout

  log "Deployment finished"
}

main "$@"



