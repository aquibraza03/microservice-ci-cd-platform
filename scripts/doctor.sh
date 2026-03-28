#!/usr/bin/env bash
set -euo pipefail

echo "🩺 Running platform diagnostics..."

FAILURES=0
WARNINGS=0

# -------------------------------
# Helpers
# -------------------------------
pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; FAILURES=$((FAILURES+1)); }
warn() { echo "⚠️ $1"; WARNINGS=$((WARNINGS+1)); }

check_cmd() {
  local name="$1"
  local cmd="$2"

  if command -v "$cmd" >/dev/null 2>&1; then
    pass "$name ($cmd)"
  else
    fail "$name ($cmd) not found"
  fi
}

check_file() {
  local name="$1"
  local path="$2"

  if [[ -f "$path" ]]; then
    pass "$name"
  else
    fail "$name missing ($path)"
  fi
}

check_dir() {
  local name="$1"
  local path="$2"

  if [[ -d "$path" ]]; then
    pass "$name"
  else
    fail "$name missing ($path)"
  fi
}

# -------------------------------
# Core tools
# -------------------------------
echo ""
echo "🔧 Checking required tools..."

for tool in bash git curl; do
  check_cmd "Required tool" "$tool"
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

check_dir "ci directory" "ci"
check_dir "platform directory" "platform"
check_dir "scripts directory" "scripts"
check_dir "services directory" "services"

check_file "platform defaults" "platform/defaults.env"
check_dir "platform profiles" "platform/profiles"

# -------------------------------
# Git status (NEW - SAFE)
# -------------------------------
echo ""
echo "🔄 Checking Git status..."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then

  if git diff --quiet && git diff --cached --quiet; then
    pass "Git repo clean"
  else
    warn "Uncommitted changes detected"
  fi

else
  warn "Not a git repository"
fi

# -------------------------------
# Platform config load
# -------------------------------
echo ""
echo "🧠 Checking platform config..."

if source platform/load-profile.sh >/dev/null 2>&1; then
  pass "Platform config loads"
else
  fail "Platform config failed"
fi

# -------------------------------
# Environment file
# -------------------------------
echo ""
echo "🌍 Checking environment..."

if [[ -f ".env" ]]; then
  pass ".env file exists"
else
  warn ".env file missing"
fi

# -------------------------------
# AWS check (optional)
# -------------------------------
echo ""
echo "☁️ Checking AWS..."

if command -v aws >/dev/null 2>&1; then
  if aws sts get-caller-identity >/dev/null 2>&1; then
    pass "AWS authentication working"
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
# Services validation
# -------------------------------
echo ""
echo "🧩 Checking services..."

if [[ -d "services" ]]; then
  for svc in services/*; do
    [[ -d "$svc" ]] || continue

    name="$(basename "$svc")"

    [[ -f "$svc/service.yml" ]] \
      && pass "Service '$name' has service.yml" \
      || warn "Service '$name' missing service.yml"

    [[ -d "$svc/src" ]] \
      && pass "Service '$name' has src/" \
      || warn "Service '$name' missing src/"
  done
fi

# -------------------------------
# YAML validation (NEW - SAFE)
# -------------------------------
echo ""
echo "📄 Validating YAML..."

if command -v yq >/dev/null 2>&1; then

  found_any=false

  for svc in services/*; do
    [[ -d "$svc" ]] || continue

    file="$svc/service.yml"
    name="$(basename "$svc")"

    if [[ -f "$file" ]]; then
      found_any=true

      if yq eval . "$file" >/dev/null 2>&1; then
        pass "Service '$name' YAML valid"
      else
        warn "Service '$name' YAML invalid"
      fi
    fi
  done

  [[ "$found_any" == false ]] && warn "No service.yml files found"

else
  warn "yq not installed — skipping YAML validation"
fi

# -------------------------------
# Summary
# -------------------------------
echo ""
echo "📊 Summary:"
echo " - Failures: $FAILURES"
echo " - Warnings: $WARNINGS"

if [[ "$FAILURES" -gt 0 ]]; then
  echo "❌ Doctor found critical issues"
  exit 1
else
  echo "✅ System is healthy"
fi
