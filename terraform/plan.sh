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

echo "[INFO] Validating configuration"
terraform validate 2>&1

echo "[INFO] Generating execution plan"
terraform plan \
  -var-file="terraform.tfvars" \
  -out="${ENVIRONMENT}.tfplan" \
  -detailed-exitcode 2>&1

EXIT_CODE=$?
case $EXIT_CODE in
  0) echo "[RESULT] No changes detected" ;;
  1) echo "[ERROR] Plan failed"; exit 1 ;;
  2) echo "[RESULT] Changes detected — plan saved to ${ENVIRONMENT}.tfplan" ;;
esac
