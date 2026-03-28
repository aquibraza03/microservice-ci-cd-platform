#!/usr/bin/env bash
set -euo pipefail

SCHEMA_FILE="${SCHEMA_FILE:-platform/schema.env}"
VALIDATION_MODE="${VALIDATION_MODE:-relaxed}"   # relaxed | strict

echo "🔍 Validating platform configuration..."

[[ -f "$SCHEMA_FILE" ]] || {
  echo "⚠️ No schema file found, skipping validation"
  exit 0
}

# -------------------------------
# Helpers
# -------------------------------

is_number() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

is_boolean() {
  [[ "$1" == "true" || "$1" == "false" ]]
}

fail() {
  echo "❌ $1"
  exit 1
}

warn() {
  echo "⚠️ $1"
}

# -------------------------------
# Validation loop (SAFE PARSER)
# -------------------------------

while IFS= read -r line || [[ -n "$line" ]]; do

  # Trim
  line="$(echo "$line" | xargs)"

  # Skip empty or comment
  [[ -z "$line" || "$line" =~ ^# ]] && continue

  # Ensure KEY=VALUE format
  if [[ "$line" != *"="* ]]; then
    warn "Skipping invalid schema line: $line"
    continue
  fi

  var="${line%%=*}"
  rule="${line#*=}"

  var="$(echo "$var" | xargs)"
  rule="$(echo "$rule" | xargs)"

  # Validate variable name (cross-platform safe)
  if [[ ! "$var" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    warn "Skipping invalid schema key: $var"
    continue
  fi

  value="${!var:-}"

  # Safe parsing (no crash if missing fields)
  IFS=':' read -r type required min max pattern <<< "${rule}::::"

  # -------------------------------
  # Required check
  # -------------------------------
  if [[ "$required" == "true" && -z "$value" ]]; then
    fail "Missing required variable: $var"
  fi

  [[ -z "$value" ]] && continue

  # -------------------------------
  # Type validation
  # -------------------------------
  case "$type" in
    number)
      if ! is_number "$value"; then
        if [[ "$VALIDATION_MODE" == "strict" ]]; then
          fail "$var must be a number"
        else
          warn "$var is not a number (allowed in relaxed mode)"
        fi
      fi
      ;;
    boolean)
      if ! is_boolean "$value"; then
        if [[ "$VALIDATION_MODE" == "strict" ]]; then
          fail "$var must be true/false"
        else
          warn "$var is not boolean (allowed in relaxed mode)"
        fi
      fi
      ;;
    string)
      ;;
    *)
      warn "Unknown type for $var"
      ;;
  esac

  # -------------------------------
  # Range validation (only if numeric)
  # -------------------------------
  if [[ "$type" == "number" && "$value" =~ ^[0-9]+$ ]]; then

    if [[ -n "${min:-}" && "$value" -lt "$min" ]]; then
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var must be >= $min" || warn "$var below min"
    fi

    if [[ -n "${max:-}" && "$value" -gt "$max" ]]; then
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var must be <= $max" || warn "$var above max"
    fi

  fi

  # -------------------------------
  # Pattern validation (GENERIC)
  # -------------------------------
  if [[ -n "${pattern:-}" ]]; then
    if ! [[ "$value" =~ $pattern ]]; then
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var does not match pattern" || warn "$var pattern mismatch"
    fi
  fi

done < "$SCHEMA_FILE"

# -------------------------------
# Cross-field validation (GENERIC)
# -------------------------------

if [[ "${AUTOSCALE_ENABLED:-false}" == "true" ]]; then

  min="${AUTOSCALE_MIN_REPLICAS:-}"
  max="${AUTOSCALE_MAX_REPLICAS:-}"

  if [[ -n "$min" && -n "$max" && "$min" =~ ^[0-9]+$ && "$max" =~ ^[0-9]+$ ]]; then
    if [[ "$min" -gt "$max" ]]; then
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "AUTOSCALE_MIN_REPLICAS > MAX" || warn "Autoscale bounds invalid"
    fi
  fi

fi

echo "✅ Platform config is valid"
