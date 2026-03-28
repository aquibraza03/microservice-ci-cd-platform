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
is_number() { [[ "$1" =~ ^[0-9]+$ ]]; }
is_boolean() { [[ "$1" == "true" || "$1" == "false" ]]; }

fail() { echo "❌ $1"; exit 1; }
warn() { echo "⚠️ $1"; }

# -------------------------------
# Validation loop (CLEAN + SAFE)
# -------------------------------
while IFS= read -r line || [[ -n "$line" ]]; do

  # Trim
  line="$(echo "$line" | xargs)"

  # Skip empty / comments
  [[ -z "$line" || "$line" =~ ^# ]] && continue

  # Ensure valid KEY=VALUE
  [[ "$line" != *"="* ]] && {
    warn "Skipping invalid schema line: $line"
    continue
  }

  var="${line%%=*}"
  rule="${line#*=}"

  var="$(echo "$var" | xargs)"
  rule="$(echo "$rule" | xargs)"

  # Validate variable name
  [[ ! "$var" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && {
    warn "Skipping invalid schema key: $var"
    continue
  }

  value="${!var:-}"

  # -------------------------------
  # Safe rule parsing (NO crash)
  # -------------------------------
  IFS=':' read -r type required min max pattern <<< "${rule}::::"

  # Skip if no type defined
  [[ -z "$type" ]] && continue

  # -------------------------------
  # Required check
  # -------------------------------
  if [[ "$required" == "true" && -z "$value" ]]; then
    fail "Missing required variable: $var"
  fi

  [[ -z "$value" ]] && continue

  # -------------------------------
  # Type validation (clean)
  # -------------------------------
  case "$type" in
    number)
      if [[ -n "$value" && ! "$value" =~ ^[0-9]+$ ]]; then
        [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var must be numeric" || warn "$var not numeric"
      fi
      ;;
    boolean)
      if [[ -n "$value" && ! "$value" =~ ^(true|false)$ ]]; then
        [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var must be boolean" || warn "$var not boolean"
      fi
      ;;
    string)
      # always valid
      ;;
    *)
      warn "Unknown type '$type' for $var"
      ;;
  esac

  # -------------------------------
  # Range validation (only valid numbers)
  # -------------------------------
  if [[ "$type" == "number" && "$value" =~ ^[0-9]+$ ]]; then

    [[ -n "$min" && "$value" -lt "$min" ]] && {
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var < $min" || warn "$var below min"
    }

    [[ -n "$max" && "$value" -gt "$max" ]] && {
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var > $max" || warn "$var above max"
    }

  fi

  # -------------------------------
  # Pattern validation (ONLY if defined)
  # -------------------------------
  if [[ -n "${pattern:-}" && "$pattern" != "" ]]; then
    if ! [[ "$value" =~ $pattern ]]; then
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var pattern mismatch" || warn "$var pattern mismatch"
    fi
  fi

done < "$SCHEMA_FILE"

# -------------------------------
# Cross-field validation (generic)
# -------------------------------
if [[ "${AUTOSCALE_ENABLED:-false}" == "true" ]]; then

  min="${AUTOSCALE_MIN_REPLICAS:-}"
  max="${AUTOSCALE_MAX_REPLICAS:-}"

  if [[ "$min" =~ ^[0-9]+$ && "$max" =~ ^[0-9]+$ ]]; then
    [[ "$min" -gt "$max" ]] && {
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "Autoscale min > max" || warn "Autoscale bounds invalid"
    }
  fi

fi

echo "✅ Platform config is valid"
