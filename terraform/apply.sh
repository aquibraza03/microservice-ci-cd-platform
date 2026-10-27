#!/usr/bin/env bash
set -Eeuo pipefail

ENVIRONMENT="${1:?Usage: $0 <environment>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR="${SCRIPT_DIR}/../environments/${ENVIRONMENT}"

if [[ ! -d "$ENV_DIR" ]]; then
  echo "[FATAL] Environment directory not found: $ENV_DIR"
  exit 1
fi

cd "$ENV_DIR"

echo "[INFO] Initializing Terraform for environment: $ENVIRONMENT"
terraform init -reconfigure -upgrade 2>&1

PLAN_FILE="${ENVIRONMENT}.tfplan"

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "[INFO] No saved plan found — generating plan"
  terraform plan \
    -var-file="terraform.tfvars" \
    -out="$PLAN_FILE" \
    2>&1
fi

echo "[INFO] Applying infrastructure"
terraform apply "$PLAN_FILE" 2>&1

echo "[SUCCESS] Apply completed for environment: $ENVIRONMENT"
