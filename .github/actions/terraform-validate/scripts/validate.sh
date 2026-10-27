#!/usr/bin/env bash
set -Eeuo pipefail

# ------------------------------------------------------------------------------
# Terraform Validate Script
# Supports:
# - fmt check
# - init (backend/no-backend)
# - validate
# - tflint
# - trivy config scan
# - optional plan + plan.json
# ------------------------------------------------------------------------------

log() {
  echo "[terraform-validate] $*"
}

fail() {
  echo "[terraform-validate] ERROR: $*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

# ------------------------------------------------------------------------------
# Required Variables
# ------------------------------------------------------------------------------

: "${WORKING_DIRECTORY:?WORKING_DIRECTORY is required}"

TF_VERSION="${TF_VERSION:-1.9.7}"
BACKEND="${BACKEND:-false}"
BACKEND_CONFIG="${BACKEND_CONFIG:-}"

RUN_TFLINT="${RUN_TFLINT:-true}"
RUN_TRIVY="${RUN_TRIVY:-true}"
RUN_PLAN="${RUN_PLAN:-false}"

VAR_FILE="${VAR_FILE:-}"

# ------------------------------------------------------------------------------
# Validate Inputs
# ------------------------------------------------------------------------------

[ -d "$WORKING_DIRECTORY" ] || fail "Directory not found: $WORKING_DIRECTORY"

require terraform

if [ "$RUN_TFLINT" = "true" ]; then
  require tflint
fi

if [ "$RUN_TRIVY" = "true" ]; then
  require trivy
fi

# ------------------------------------------------------------------------------
# Status Variables
# ------------------------------------------------------------------------------

FMT_STATUS="skipped"
INIT_STATUS="skipped"
VALIDATE_STATUS="skipped"
TFLINT_STATUS="skipped"
TRIVY_STATUS="skipped"
PLAN_STATUS="skipped"

# ------------------------------------------------------------------------------
# Terraform fmt
# ------------------------------------------------------------------------------

log "Running terraform fmt check"

terraform -chdir="$WORKING_DIRECTORY" fmt -recursive -check
FMT_STATUS="passed"

# ------------------------------------------------------------------------------
# Terraform init
# ------------------------------------------------------------------------------

log "Running terraform init"

if [ "$BACKEND" = "false" ]; then
  terraform -chdir="$WORKING_DIRECTORY" init -backend=false
else
  if [ -n "$BACKEND_CONFIG" ]; then
    [ -f "$BACKEND_CONFIG" ] || fail "Backend config not found: $BACKEND_CONFIG"
    terraform -chdir="$WORKING_DIRECTORY" init -backend-config="$BACKEND_CONFIG"
  else
    terraform -chdir="$WORKING_DIRECTORY" init
  fi
fi

INIT_STATUS="passed"

# ------------------------------------------------------------------------------
# Terraform validate
# ------------------------------------------------------------------------------

log "Running terraform validate"

terraform -chdir="$WORKING_DIRECTORY" validate
VALIDATE_STATUS="passed"

# ------------------------------------------------------------------------------
# TFLint
# ------------------------------------------------------------------------------

if [ "$RUN_TFLINT" = "true" ]; then
  log "Running tflint"

  tflint --init
  tflint "$WORKING_DIRECTORY"

  TFLINT_STATUS="passed"
fi

# ------------------------------------------------------------------------------
# Trivy IaC Scan
# ------------------------------------------------------------------------------

if [ "$RUN_TRIVY" = "true" ]; then
  log "Running trivy config scan"

  trivy config "$WORKING_DIRECTORY"

  TRIVY_STATUS="passed"
fi

# ------------------------------------------------------------------------------
# Terraform Plan + JSON
# ------------------------------------------------------------------------------

if [ "$RUN_PLAN" = "true" ]; then
  log "Running terraform plan"

  if [ -n "$VAR_FILE" ]; then
    [ -f "$VAR_FILE" ] || fail "tfvars file not found: $VAR_FILE"

    terraform -chdir="$WORKING_DIRECTORY" \
      plan \
      -var-file="$VAR_FILE" \
      -out=tfplan
  else
    terraform -chdir="$WORKING_DIRECTORY" \
      plan \
      -out=tfplan
  fi

  terraform -chdir="$WORKING_DIRECTORY" \
    show -json tfplan > "$WORKING_DIRECTORY/plan.json"

  PLAN_STATUS="passed"
fi

# ------------------------------------------------------------------------------
# GitHub Outputs
# ------------------------------------------------------------------------------

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "fmt_status=$FMT_STATUS"
    echo "init_status=$INIT_STATUS"
    echo "validate_status=$VALIDATE_STATUS"
    echo "tflint_status=$TFLINT_STATUS"
    echo "trivy_status=$TRIVY_STATUS"
    echo "plan_status=$PLAN_STATUS"
  } >> "$GITHUB_OUTPUT"
fi

# ------------------------------------------------------------------------------
# GitHub Summary
# ------------------------------------------------------------------------------

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Terraform Validation Results"
    echo "- Directory: $WORKING_DIRECTORY"
    echo "- fmt: $FMT_STATUS"
    echo "- init: $INIT_STATUS"
    echo "- validate: $VALIDATE_STATUS"
    echo "- tflint: $TFLINT_STATUS"
    echo "- trivy: $TRIVY_STATUS"
    echo "- plan: $PLAN_STATUS"
  } >> "$GITHUB_STEP_SUMMARY"
fi

log "Completed successfully"
