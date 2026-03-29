#!/usr/bin/env bash
set -euo pipefail

# -------------------------------
# Config (NO HARDCODING)
# -------------------------------
SERVICE_NAME="${1:-}"
TEMPLATE="${TEMPLATE:-node-service}"
SERVICES_DIR="${SERVICES_DIR:-services}"
TEMPLATES_DIR="${TEMPLATES_DIR:-templates}"
PLACEHOLDER_PREFIX="${PLACEHOLDER_PREFIX:-{{}"
PLACEHOLDER_SUFFIX="${PLACEHOLDER_SUFFIX:-}}"
DRY_RUN="${DRY_RUN:-false}"
VALIDATOR_SCRIPT="${VALIDATOR_SCRIPT:-./ci/validate-service.sh}"

# -------------------------------
# Helpers
# -------------------------------
fail() { echo "❌ $1"; exit 1; }
info() { echo "ℹ️ $1"; }
success() { echo "✅ $1"; }

trim() {
  local var="$1"
  var="${var#"${var%%[![:space:]]*}"}"
  var="${var%"${var##*[![:space:]]}"}"
  echo -n "$var"
}

to_upper() {
  echo "$1" | tr '[:lower:]' '[:upper:]'
}

to_camel() {
  echo "$1" | awk -F- '{for(i=1;i<=NF;i++) printf toupper(substr($i,1,1)) substr($i,2)}'
}

# -------------------------------
# Validate input
# -------------------------------
[[ -z "$SERVICE_NAME" ]] && fail "Usage: $0 <service-name>"

if [[ ! "$SERVICE_NAME" =~ ^[a-z0-9-]+$ ]]; then
  fail "Invalid service name (use lowercase, numbers, hyphens)"
fi

SERVICE_PATH="$SERVICES_DIR/$SERVICE_NAME"
TEMPLATE_PATH="$TEMPLATES_DIR/$TEMPLATE"

# -------------------------------
# Validate template
# -------------------------------
[[ ! -d "$TEMPLATE_PATH" ]] && fail "Template not found: $TEMPLATE"

[[ ! -f "$TEMPLATE_PATH/service.yml" ]] && \
  fail "Invalid template: missing service.yml"

[[ ! -d "$TEMPLATE_PATH/src" ]] && \
  fail "Invalid template: missing src/"

# -------------------------------
# Prevent overwrite
# -------------------------------
[[ -d "$SERVICE_PATH" ]] && fail "Service already exists: $SERVICE_NAME"

# -------------------------------
# Dry run
# -------------------------------
if [[ "$DRY_RUN" == "true" ]]; then
  info "[DRY RUN] Would create: $SERVICE_PATH"
  info "[DRY RUN] Using template: $TEMPLATE"
  exit 0
fi

# -------------------------------
# Create service
# -------------------------------
echo "🚀 Creating service: $SERVICE_NAME"
mkdir -p "$SERVICE_PATH"

# Copy template (including hidden files)
cp -r "$TEMPLATE_PATH"/. "$SERVICE_PATH"/

# -------------------------------
# Dynamic Placeholder Engine
# -------------------------------
declare -A VARS

VARS["SERVICE_NAME"]="$SERVICE_NAME"
VARS["SERVICE_NAME_UPPER"]="$(to_upper "$SERVICE_NAME")"
VARS["SERVICE_NAME_CAMEL"]="$(to_camel "$SERVICE_NAME")"
VARS["SERVICE_PATH"]="$SERVICE_PATH"

# Inject custom variables via ENV (prefix TPL_)
while IFS='=' read -r key _; do
  if [[ "$key" == TPL_* ]]; then
    clean_key="${key#TPL_}"
    VARS["$clean_key"]="${!key}"
  fi
done < <(env)

# -------------------------------
# Replace placeholders
# -------------------------------
replace_file() {
  local file="$1"

  for key in "${!VARS[@]}"; do
    value="${VARS[$key]}"
    placeholder="${PLACEHOLDER_PREFIX}${key}${PLACEHOLDER_SUFFIX}"

    sed -i.bak "s|$placeholder|$value|g" "$file" 2>/dev/null || \
    sed -i '' "s|$placeholder|$value|g" "$file" 2>/dev/null || true
  done

  rm -f "$file.bak"
}

while IFS= read -r -d '' file; do
  replace_file "$file"
done < <(find "$SERVICE_PATH" -type f -print0)

# -------------------------------
# Hooks (EXTENSIBLE)
# -------------------------------
run_hook() {
  local hook="$1"

  if [[ -f "$TEMPLATE_PATH/hooks/$hook.sh" ]]; then
    info "Running template hook: $hook"
    bash "$TEMPLATE_PATH/hooks/$hook.sh" "$SERVICE_NAME"
  fi
}

run_hook "pre"
run_hook "post"

# -------------------------------
# Final validation
# -------------------------------
[[ ! -f "$SERVICE_PATH/service.yml" ]] && \
  fail "service.yml missing after generation"

[[ ! -d "$SERVICE_PATH/src" ]] && \
  fail "src/ missing after generation"

# -------------------------------
# Output
# -------------------------------
success "Service created successfully"
echo "📦 Path: $SERVICE_PATH"
echo "🧩 Template: $TEMPLATE"

# -------------------------------
# Optional validation
# -------------------------------
if [[ -f "$VALIDATOR_SCRIPT" ]]; then
  echo "🔍 Running service validation..."
  "$VALIDATOR_SCRIPT" "$SERVICE_NAME" || true
fi
