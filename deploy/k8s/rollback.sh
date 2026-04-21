#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOYMENT="${1:-}"
REVISION="${2:-}"

: "${NAMESPACE:?NAMESPACE must be set}"
: "${ROLLOUT_TIMEOUT:?ROLLOUT_TIMEOUT must be set}"

TIMEOUT="${ROLLOUT_TIMEOUT}"
DRY_RUN="${DRY_RUN:-false}"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

trap 'fail "Unexpected error on line $LINENO"' ERR

if [[ -z "${DEPLOYMENT}" ]]; then
  fail "Usage: $0 <deployment-name> [revision]"
fi

[[ "${TIMEOUT}" =~ ^[0-9]+s$ ]] || fail "ROLLOUT_TIMEOUT must look like 300s"

command -v kubectl >/dev/null 2>&1 || fail "kubectl is not installed or not in PATH"

kubectl cluster-info >/dev/null 2>&1 || fail "Unable to connect to Kubernetes cluster"

kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1 || fail "Namespace '${NAMESPACE}' not found"

kubectl auth can-i get deployments -n "${NAMESPACE}" >/dev/null 2>&1 || fail "Insufficient permissions in namespace '${NAMESPACE}'"

kubectl -n "${NAMESPACE}" get deployment "${DEPLOYMENT}" >/dev/null 2>&1 || fail "Deployment '${DEPLOYMENT}' not found in namespace '${NAMESPACE}'"

log "Current rollout history for deployment/${DEPLOYMENT}:"
kubectl -n "${NAMESPACE}" rollout history deployment/"${DEPLOYMENT}"

if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY_RUN=true: rollback not executed."
  if [[ -n "${REVISION}" ]]; then
    log "Would run: kubectl -n ${NAMESPACE} rollout undo deployment/${DEPLOYMENT} --to-revision=${REVISION}"
  else
    log "Would run: kubectl -n ${NAMESPACE} rollout undo deployment/${DEPLOYMENT}"
  fi
  log "Would wait: kubectl -n ${NAMESPACE} rollout status deployment/${DEPLOYMENT} --timeout=${TIMEOUT}"
  exit 0
fi

if [[ -n "${REVISION}" ]]; then
  log "Rolling back deployment/${DEPLOYMENT} to revision ${REVISION} in namespace ${NAMESPACE}..."
  kubectl -n "${NAMESPACE}" rollout undo deployment/"${DEPLOYMENT}" --to-revision="${REVISION}"
else
  log "Rolling back deployment/${DEPLOYMENT} to previous revision in namespace ${NAMESPACE}..."
  kubectl -n "${NAMESPACE}" rollout undo deployment/"${DEPLOYMENT}"
fi

log "Waiting for rollout to complete (timeout: ${TIMEOUT})..."
kubectl -n "${NAMESPACE}" rollout status deployment/"${DEPLOYMENT}" --timeout="${TIMEOUT}"

log "Rollback completed successfully."

log "Updated rollout history for deployment/${DEPLOYMENT}:"
kubectl -n "${NAMESPACE}" rollout history deployment/"${DEPLOYMENT}"
