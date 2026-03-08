#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"

BASE_DIR="deploy/k8s/base"

# Environment-driven variables
SERVICE_NAME="${SERVICE_NAME:-$SERVICE}"
K8S_NAMESPACE="${K8S_NAMESPACE:-dev}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:?IMAGE_REGISTRY required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"

log() {
  echo "[K8S-DEPLOY/$SERVICE_NAME] $*"
}

setup_kubeconfig() {
  if [[ -n "${KUBECONFIG:-}" ]]; then
    export KUBECONFIG
  fi

  kubectl get ns "$K8S_NAMESPACE" >/dev/null 2>&1 || {
    log "Creating namespace $K8S_NAMESPACE"
    kubectl create namespace "$K8S_NAMESPACE"
  }
}

render_manifests() {
  TMP_DIR="/tmp/${SERVICE_NAME}-k8s"
  mkdir -p "$TMP_DIR"

  log "Rendering Kubernetes manifests"

  envsubst < "$BASE_DIR/deployment.yaml" > "$TMP_DIR/deployment.yaml"
  envsubst < "$BASE_DIR/service.yaml" > "$TMP_DIR/service.yaml"
}

apply_manifests() {
  log "Applying Kubernetes manifests"

  kubectl apply -f "/tmp/${SERVICE_NAME}-k8s" -n "$K8S_NAMESPACE"
}

wait_for_rollout() {
  log "Waiting for rollout..."

  kubectl rollout status deployment/"$SERVICE_NAME" \
    -n "$K8S_NAMESPACE" \
    --timeout=300s
}

main() {
  log "Deploying $SERVICE_NAME"

  setup_kubeconfig
  render_manifests
  apply_manifests
  wait_for_rollout

  log "Deployment successful"
}

main "$@"
