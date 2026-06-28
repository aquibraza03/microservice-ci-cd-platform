#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

############################################
# Local override support (developer testing)
############################################

LOCAL_ENV_FILE="$ROOT_DIR/.env.local"

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
IMAGE_PULL_POLICY="${IMAGE_PULL_POLICY:-IfNotPresent}"

RUN_AS_NON_ROOT="${RUN_AS_NON_ROOT:-true}"
RUN_AS_USER="${RUN_AS_USER:-1000}"
RUN_AS_GROUP="${RUN_AS_GROUP:-1000}"
FS_GROUP="${FS_GROUP:-1000}"

ALLOW_PRIVILEGE_ESCALATION="${ALLOW_PRIVILEGE_ESCALATION:-false}"
READ_ONLY_ROOT_FILESYSTEM="${READ_ONLY_ROOT_FILESYSTEM:-false}"

DROP_CAPABILITY="${DROP_CAPABILITY:-ALL}"

ENVIRONMENT="${ENVIRONMENT:-dev}"
SERVICE_TYPE="${SERVICE_TYPE:-ClusterIP}"
SERVICE_PORT="${SERVICE_PORT:-80}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
REPLICAS="${REPLICAS:-1}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
READINESS_PATH="${READINESS_PATH:-/ready}"

CPU_REQUEST="${CPU_REQUEST:-100m}"
MEMORY_REQUEST="${MEMORY_REQUEST:-128Mi}"
CPU_LIMIT="${CPU_LIMIT:-500m}"
MEMORY_LIMIT="${MEMORY_LIMIT:-256Mi}"

ENABLE_HPA="${ENABLE_HPA:-true}"
HPA_MIN_REPLICAS="${HPA_MIN_REPLICAS:-1}"
HPA_MAX_REPLICAS="${HPA_MAX_REPLICAS:-3}"
HPA_CPU_UTILIZATION="${HPA_CPU_UTILIZATION:-80}"

ENABLE_PDB="${ENABLE_PDB:-true}"
PDB_MIN_AVAILABLE="${PDB_MIN_AVAILABLE:-1}"

ENABLE_NETWORK_POLICY="${ENABLE_NETWORK_POLICY:-true}"
RENDER_ONLY="${RENDER_ONLY:-false}"
RENDER_OUTPUT_DIR="${RENDER_OUTPUT_DIR:-}"

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

  BASE_DIR="$ROOT_DIR/deploy/k8s/base"
  if [[ -n "$RENDER_OUTPUT_DIR" ]]; then
    RENDER_DIR="$RENDER_OUTPUT_DIR"
  else
    RENDER_DIR="$(mktemp -d)"
  fi

  log "Rendering manifests"

  # Prevent Git Bash/MSYS from converting Kubernetes HTTP paths such as /health
  # into Windows paths when native tools like envsubst are invoked.
  export MSYS2_ENV_CONV_EXCL="${MSYS2_ENV_CONV_EXCL:-*}"

# Image
export IMAGE_REGISTRY
export IMAGE_TAG
export IMAGE_PULL_POLICY

# Service
export SERVICE_NAME
export K8S_NAMESPACE
export SERVICE_PORT
export CONTAINER_PORT
export REPLICAS

# Deployment
export DEPLOY_VERSION
export ENVIRONMENT
export SERVICE_TYPE

# Health
export HEALTH_PATH
export READINESS_PATH

# Resources
export CPU_REQUEST
export MEMORY_REQUEST
export CPU_LIMIT
export MEMORY_LIMIT

# Security
export RUN_AS_NON_ROOT
export RUN_AS_USER
export RUN_AS_GROUP
export FS_GROUP
export ALLOW_PRIVILEGE_ESCALATION
export READ_ONLY_ROOT_FILESYSTEM
export DROP_CAPABILITY

# Autoscaling
export HPA_MIN_REPLICAS
export HPA_MAX_REPLICAS
export HPA_CPU_UTILIZATION
export PDB_MIN_AVAILABLE

  mkdir -p "$RENDER_DIR/base"

  render_resource() {
    local file="$1"
    local target="$RENDER_DIR/base/$(basename "$file")"

    envsubst < "$file" > "$target"
  }

  render_resource "$BASE_DIR/serviceaccount.yaml"

  # Optional ConfigMap
  if [[ -f "$BASE_DIR/configmap.yaml" ]]; then
    render_resource "$BASE_DIR/configmap.yaml"
  fi

  # Optional Secret
  if [[ -f "$BASE_DIR/secret.yaml" ]]; then
    render_resource "$BASE_DIR/secret.yaml"
  fi

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

  {
    echo "apiVersion: kustomize.config.k8s.io/v1beta1"
    echo "kind: Kustomization"
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
    echo "  platform.io/compliance-tier: standard"
  } > "$RENDER_DIR/kustomization.yaml"

  if [[ "$RENDER_ONLY" == "true" ]]; then
    log "Render-only mode enabled. Manifests written to $RENDER_DIR"
    return 0
  fi

  kubectl apply -k "$RENDER_DIR" -n "$K8S_NAMESPACE"

  if [[ -z "$RENDER_OUTPUT_DIR" ]]; then
    rm -rf "$RENDER_DIR"
  fi
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



