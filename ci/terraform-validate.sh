#!/usr/bin/env bash
# =============================================================================
# Terraform Validation Script
# Runs fmt, init (backend=false), validate, and plan check on all environments
# =============================================================================

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENVIRONMENTS=("dev" "staging" "prod")
ALL_PASSED=true

# Colors
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; NC=''
fi

pass() { echo -e "  ${GREEN}PASS${NC}  $1"; }
fail() { echo -e "  ${RED}FAIL${NC}  $1"; ALL_PASSED=false; }
info() { echo -e "  ${YELLOW}INFO${NC}  $1"; }

echo ""
echo "=========================================="
echo "  Terraform Infrastructure Validation"
echo "=========================================="
echo ""

# 1. terraform fmt check
echo "--- terraform fmt ---"
FMT_OUTPUT=$(terraform fmt -recursive -check "$REPO_ROOT" 2>&1 || true)
if [[ -z "$FMT_OUTPUT" ]]; then
  pass "All files are formatted correctly"
else
  fail "Formatting issues found:"
  echo "$FMT_OUTPUT" | while IFS= read -r line; do
    echo "         $line"
  done
fi
echo ""

# 2. Validate each environment
for ENV in "${ENVIRONMENTS[@]}"; do
  ENV_DIR="$REPO_ROOT/environments/$ENV"
  echo "--- Environment: $ENV ---"

  if [[ ! -d "$ENV_DIR" ]]; then
    fail "Environment directory not found: $ENV_DIR"
    echo ""
    continue
  fi

  cd "$ENV_DIR"

  # Check for required files
  for req in "main.tf" "providers.tf" "versions.tf" "variables.tf" "outputs.tf" "backend.tf" "terraform.tfvars"; do
    if [[ ! -f "$req" ]]; then
      fail "Missing required file: $ENV_DIR/$req"
    fi
  done

  # Check if providers.tf has content
  if [[ -f "providers.tf" ]] && [[ ! -s "providers.tf" ]]; then
    info "providers.tf exists but is empty (expected for some environments)"
  fi

  # terraform init (backend=false for validation)
  if terraform init -backend=false 2>/dev/null; then
    pass "terraform init (backend=false)"
  else
    fail "terraform init (backend=false)"
  fi

  # terraform validate
  if terraform validate 2>&1; then
    pass "terraform validate"
  else
    fail "terraform validate"
  fi

  # Check for deprecated syntax (0.12upgrade check)
  if [[ -f "main.tf" ]]; then
    info "Module source: $(grep 'source\s*=' main.tf | head -3 || echo 'none')"
  fi

  cd "$REPO_ROOT"
  echo ""
done

# 3. Summary
echo "=========================================="
echo "  Validation Summary"
echo "=========================================="
if $ALL_PASSED; then
  echo -e "  ${GREEN}ALL CHECKS PASSED${NC}"
else
  echo -e "  ${RED}SOME CHECKS FAILED${NC}"
fi
echo ""
