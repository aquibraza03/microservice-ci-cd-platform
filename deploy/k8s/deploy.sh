#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ============================================================================
# Local override support (developer testing)
# ============================================================================
LOCAL_ENV_FILE="$ROOT_DIR/.env.local"
if [[ -f "$LOCAL_ENV_FILE" ]]; then
  echo "[DEV] Loading local overrides from $LOCAL_ENV_FILE"
  set -a
  source "$LOCAL_ENV_FILE"
  set +a
fi

# ============================================================================
# Environment-driven configuration
# ============================================================================
SERVICE_NAME="${SERVICE_NAME:-$SERVICE}"
K8S_NAMESPACE="${K8S_NAMESPACE:-default}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:?IMAGE_REGISTRY required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"

ENVIRONMENT="${ENVIRONMENT:-dev}"
SERVICE_TYPE="${SERVICE_TYPE:-ClusterIP}"
SERVICE_PORT="${SERVICE_PORT:-80}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
REPLICAS="${REPLICAS:-1}"

STARTUP_PATH="${STARTUP_PATH:-/health}"
READINESS_PATH="${READINESS_PATH:-/ready}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
METRICS_PATH="${METRICS_PATH:-/metrics}"

CPU_REQUEST="${CPU_REQUEST:-100m}"
MEMORY_REQUEST="${MEMORY_REQUEST:-128Mi}"
CPU_LIMIT="${CPU_LIMIT:-500m}"
MEMORY_LIMIT="${MEMORY_LIMIT:-256Mi}"

ENABLE_HPA="${ENABLE_HPA:-true}"
HPA_MIN_REPLICAS="${HPA_MIN_REPLICAS:-1}"
HPA_MAX_REPLICAS="${HPA_MAX_REPLICAS:-3}"
HPA_CPU_UTILIZATION="${HPA_CPU_UTILIZATION:-80}"
HPA_MEM_UTILIZATION="${HPA_MEM_UTILIZATION:-80}"

ENABLE_PDB="${ENABLE_PDB:-true}"
PDB_MAX_UNAVAILABLE="${PDB_MAX_UNAVAILABLE:-1}"

ENABLE_NETWORK_POLICY="${ENABLE_NETWORK_POLICY:-true}"
COMPLIANCE_TIER="${COMPLIANCE_TIER:-standard}"

RENDER_ONLY="${RENDER_ONLY:-false}"
RENDER_OUTPUT_DIR="${RENDER_OUTPUT_DIR:-}"

DEPLOY_VERSION="${DEPLOY_VERSION:-$(date +%s)}"
CREATE_NAMESPACE="${CREATE_NAMESPACE:-false}"

# ============================================================================
# Logging helper
# ============================================================================
log() { echo "[K8S-DEPLOY/$SERVICE_NAME] $*"; }
fail() { echo "[FAIL] $*" >&2; exit 1; }

# ============================================================================
# Check kubectl connectivity
# ============================================================================
check_cluster() {
  command -v kubectl >/dev/null 2>&1 || fail "kubectl not installed"
  kubectl cluster-info >/dev/null 2>&1 || fail "Kubernetes cluster not reachable"
}

# ============================================================================
# Optional namespace creation
# ============================================================================
ensure_namespace() {
  if [[ "$CREATE_NAMESPACE" == "true" ]]; then
    if ! kubectl get namespace "$K8S_NAMESPACE" >/dev/null 2>&1; then
      log "Creating namespace $K8S_NAMESPACE"
      kubectl create namespace "$K8S_NAMESPACE"
    fi
  else
    log "Using namespace $K8S_NAMESPACE"
  fi
}

# ============================================================================
# Render and apply manifests
# ============================================================================
deploy_manifests() {
  BASE_DIR="$ROOT_DIR/deploy/k8s/base"
  if [[ -n "$RENDER_OUTPUT_DIR" ]]; then
    RENDER_DIR="$RENDER_OUTPUT_DIR"
  else
    RENDER_DIR="$(mktemp -d)"
  fi

  log "Rendering manifests to $RENDER_DIR"

  # Prevent Git Bash/MSYS from converting Kubernetes HTTP paths
  export MSYS2_ENV_CONV_EXCL="${MSYS2_ENV_CONV_EXCL:-*}"

  export SERVICE_NAME IMAGE_REGISTRY IMAGE_TAG K8S_NAMESPACE
  export SERVICE_PORT CONTAINER_PORT REPLICAS DEPLOY_VERSION
  export ENVIRONMENT SERVICE_TYPE
  export STARTUP_PATH READINESS_PATH HEALTH_PATH METRICS_PATH
  export CPU_REQUEST MEMORY_REQUEST CPU_LIMIT MEMORY_LIMIT
  export HPA_MIN_REPLICAS HPA_MAX_REPLICAS HPA_CPU_UTILIZATION HPA_MEM_UTILIZATION
  export PDB_MAX_UNAVAILABLE COMPLIANCE_TIER

  mkdir -p "$RENDER_DIR/base"

  render_resource() {
    local file="$1"
    local target="$RENDER_DIR/base/$(basename "$file")"
    envsubst < "$file" > "$target"
  }

  render_resource "$BASE_DIR/serviceaccount.yaml"
  render_resource "$BASE_DIR/deployment.yaml"
  render_resource "$BASE_DIR/service.yaml"

  if [[ "$ENABLE_HPA" == "true" ]]; then
    render_resource "$BASE_DIR/hpa.yaml"
  fi

  if [[ "$ENABLE_PDB" == "true" ]]; then
    render_resource "$BASE_DIR/pdb.yaml"
  fi

  if [[ "$ENABLE_NETWORK_POLICY" == "true" ]]; then
    render_resource "$BASE_DIR/networkpolicy.yaml"
  fi

  # Generate kustomization.yaml
  {
    echo "apiVersion: kustomize.config.k8s.io/v1"
    echo "kind: Kustomization"
    echo ""
    echo "namespace: ${K8S_NAMESPACE}"
    echo ""
    echo "resources:"
    find "$RENDER_DIR/base" -maxdepth 1 -type f -name "*.yaml" -print |
      sort |
      sed "s#^$RENDER_DIR/#  - #"
    echo ""
    echo "labels:"
    echo "  - pairs:"
    echo "      app.kubernetes.io/managed-by: kustomize"
    echo "      app.kubernetes.io/part-of: microservice-platform"
    echo "    includeSelectors: false"
    echo "    includeTemplates: true"
    echo ""
    echo "commonAnnotations:"
    echo "  platform.io/deployment-model: kustomize"
    echo "  platform.io/compliance-tier: ${COMPLIANCE_TIER}"
    echo "  platform.io/last-deploy: \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
  } > "$RENDER_DIR/kustomization.yaml"

  if [[ "$RENDER_ONLY" == "true" ]]; then
    log "Render-only mode. Manifests at $RENDER_DIR"
    return 0
  fi

  log "Applying manifests to namespace $K8S_NAMESPACE"
  kubectl apply -k "$RENDER_DIR" -n "$K8S_NAMESPACE"

  if [[ -z "$RENDER_OUTPUT_DIR" ]]; then
    rm -rf "$RENDER_DIR"
  fi
}

# ============================================================================
# Wait for rollout
# ============================================================================
wait_for_rollout() {
  log "Waiting for rollout (timeout: 300s)"
  if ! kubectl rollout status deployment/"$SERVICE_NAME" \
      -n "$K8S_NAMESPACE" \
      --timeout=300s; then
    log "Deployment failed. Rolling back..."
    kubectl rollout undo deployment/"$SERVICE_NAME" \
      -n "$K8S_NAMESPACE"
    fail "Rolled back to previous revision"
  fi
  log "Rollout complete"
}

# ============================================================================
# Main execution
# ============================================================================
main() {
  log "Deploying $SERVICE_NAME"

  if [[ "$RENDER_ONLY" == "true" ]]; then
    deploy_manifests
    return 0
  fi

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
