#!/usr/bin/env bash
set -euo pipefail

# -------------------------------
# Dynamic inputs (NO HARDCODING)
# -------------------------------
PROFILE="${PROFILE:-}"
PLATFORM_DIR="${PLATFORM_DIR:-platform}"

DEFAULTS_FILE="${DEFAULTS_FILE:-$PLATFORM_DIR/defaults.env}"
PROFILES_DIR="${PROFILES_DIR:-$PLATFORM_DIR/profiles}"

# -------------------------------
# Resolve profile (fallback logic)
# -------------------------------
if [[ -z "${PROFILE}" ]]; then
  if [[ -n "${ENV:-}" ]]; then
    PROFILE="$ENV"
  else
    PROFILE="startup"
  fi
fi

PROFILE_FILE="$PROFILES_DIR/${PROFILE}.env"

echo "⚙️ Loading platform profile: $PROFILE"

# -------------------------------
# Ensure required files exist
# -------------------------------
[[ -f "$DEFAULTS_FILE" ]] || {
  echo "❌ Missing defaults file: $DEFAULTS_FILE"
  exit 1
}

# -------------------------------
# Load env file safely
# -------------------------------
load_env_file() {
  local file=$1

  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue

    # Trim spaces
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | xargs)"

    export "$key"="$value"
  done < "$file"
}

# -------------------------------
# Load defaults
# -------------------------------
echo "📦 Loading defaults"
load_env_file "$DEFAULTS_FILE"

# -------------------------------
# Load profile overrides
# -------------------------------
if [[ -f "$PROFILE_FILE" ]]; then
  echo "📈 Applying profile overrides"
  load_env_file "$PROFILE_FILE"
else
  echo "⚠️ Profile not found: $PROFILE (using defaults only)"
fi

# -------------------------------
# Apply runtime overrides (highest priority)
# -------------------------------
for var in $(env | grep '_OVERRIDE=' | cut -d= -f1); do
  base_var="${var%_OVERRIDE}"
  override_value="${!var}"

  echo "🔧 Applying override: $base_var"
  export "$base_var"="$override_value"
done

# -------------------------------
# Normalize values (generic, safe)
# -------------------------------
normalize_bool() {
  case "$1" in
    true|TRUE|1) echo "true" ;;
    false|FALSE|0) echo "false" ;;
    *) echo "$1" ;;
  esac
}

# Normalize known flags dynamically
for var in $(env | cut -d= -f1); do
  value="${!var}"

  if [[ "$value" =~ ^(true|false|TRUE|FALSE|0|1)$ ]]; then
    export "$var"="$(normalize_bool "$value")"
  fi
done

# -------------------------------
# Optional validation hook
# -------------------------------
VALIDATION_SCRIPT="${PLATFORM_DIR}/validate-profile.sh"

if [[ -f "$VALIDATION_SCRIPT" ]]; then
  echo "🔍 Running validation"
  source "$VALIDATION_SCRIPT"
fi

# -------------------------------
# Final output (debug-friendly)
# -------------------------------
echo "✅ Final platform configuration loaded"

if [[ "${DEBUG:-false}" == "true" ]]; then
  echo "------ CONFIG DUMP ------"
  env | sort
  echo "-------------------------"
fi
