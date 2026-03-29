#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
ENV_FILE="${ENV_FILE:-environments/$ENVIRONMENT/env.example}"

FAILURES=0
WARNINGS=0

pass() { echo "✅ $1"; }
warn() { echo "⚠️ $1"; ((WARNINGS++)); }
fail() { echo "❌ $1"; ((FAILURES++)); }

echo "🩺 Running platform diagnostics..."
echo ""

# -------------------------------
# Required tools
# -------------------------------
echo "🔧 Checking required tools..."
for tool in bash git curl; do
  if command -v "$tool" >/dev/null 2>&1; then
    pass "Required tool ($tool)"
  else
    fail "Missing required tool ($tool)"
  fi
done

# Optional tools
for tool in docker jq yq aws; do
  if command -v "$tool" >/dev/null 2>&1; then
    pass "Optional tool ($tool)"
  else
    warn "Optional tool missing ($tool)"
  fi
done

# -------------------------------
# Project structure
# -------------------------------
echo ""
echo "📁 Checking project structure..."

for dir in ci platform scripts services; do
  [[ -d "$dir" ]] && pass "$dir directory" || fail "$dir directory missing"
done

[[ -d "platform/defaults" ]] && pass "platform defaults" || warn "platform defaults missing"
[[ -d "platform/profiles" ]] && pass "platform profiles" || warn "platform profiles missing"

# -------------------------------
# Git status
# -------------------------------
echo ""
echo "🔄 Checking Git status..."

if [[ -n "$(git status --porcelain)" ]]; then
  warn "Uncommitted changes detected"
else
  pass "Working tree clean"
fi

# -------------------------------
# Platform config
# -------------------------------
echo ""
echo "🧠 Checking platform config..."

if [[ -f "platform/schema.env" ]]; then
  pass "Platform config loads"
else
  fail "Missing platform/schema.env"
fi

# -------------------------------
# Environment (FIXED)
# -------------------------------
echo ""
echo "🌍 Checking environment..."

if [[ -f "$ENV_FILE" ]]; then
  pass "Environment config found ($ENV_FILE)"
else
  warn "Environment config missing ($ENV_FILE)"
fi

# -------------------------------
# AWS check
# -------------------------------
echo ""
echo "☁️ Checking AWS..."

if command -v aws >/dev/null 2>&1; then
  if aws sts get-caller-identity >/dev/null 2>&1; then
    pass "AWS authenticated"
  else
    warn "AWS CLI present but not authenticated"
  fi
else
  warn "AWS CLI not installed"
fi

# -------------------------------
# Docker check
# -------------------------------
echo ""
echo "🐳 Checking Docker..."

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    pass "Docker running"
  else
    warn "Docker installed but not running"
  fi
else
  warn "Docker not installed"
fi

# -------------------------------
# Services check
# -------------------------------
echo ""
echo "🧩 Checking services..."

if [[ -d "services" ]]; then
  for service in services/*; do
    [[ -d "$service" ]] || continue

    name="$(basename "$service")"

    [[ -f "$service/service.yml" ]] \
      && pass "Service '$name' has service.yml" \
      || warn "Service '$name' missing service.yml"

    [[ -d "$service/src" ]] \
      && pass "Service '$name' has src/" \
      || warn "Service '$name' missing src/"
  done
else
  warn "No services directory"
fi

# -------------------------------
# YAML validation
# -------------------------------
echo ""
echo "📄 Validating YAML..."

if command -v yq >/dev/null 2>&1; then
  for file in services/*/service.yml; do
    [[ -f "$file" ]] || continue

    if yq e '.' "$file" >/dev/null 2>&1; then
      pass "Service '$(basename "$(dirname "$file")")' YAML valid"
    else
      warn "Invalid YAML in $file"
    fi
  done
else
  warn "yq not installed (skipping YAML validation)"
fi

# -------------------------------
# Summary
# -------------------------------
echo ""
echo "📊 Summary:"
echo " - Failures: $FAILURES"
echo " - Warnings: $WARNINGS"

if [[ "$FAILURES" -gt 0 ]]; then
  echo "❌ System has issues"
  exit 1
else
  echo "✅ System is healthy"
fi
