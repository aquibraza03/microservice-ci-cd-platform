#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:?Usage: $0 <environment>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[TERRAFORM-PLAN] Planning infrastructure for: $ENVIRONMENT"

TERRAFORM_DIR="${SCRIPT_DIR}/environments/${ENVIRONMENT}"

if [ -d "$TERRAFORM_DIR" ]; then
  cd "$TERRAFORM_DIR"
  terraform init -backend=false
  terraform validate
  terraform plan -var-file=terraform.tfvars
else
  echo "[TERRAFORM-PLAN] No environment directory found at: $TERRAFORM_DIR"
  echo "[TERRAFORM-PLAN] Ensure environments/$ENVIRONMENT has a main.tf"
  exit 1
fi
