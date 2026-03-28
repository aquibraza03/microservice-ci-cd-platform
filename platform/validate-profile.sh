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
# Validation loop (schema-driven)
# -------------------------------
while IFS= read -r line || [[ -n "$line" ]]; do

  line="$(echo "$line" | xargs)"

  [[ -z "$line" || "$line" =~ ^# ]] && continue

  if [[ "$line" != *"="* ]]; then
    warn "Skipping invalid schema line: $line"
    continue
  fi

  var="${line%%=*}"
  rule="${line#*=}"

  var="$(echo "$var" | xargs)"
  rule="$(echo "$rule" | xargs)"

  # Skip invalid variable names
  [[ ! "$var" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && {
    warn "Skipping invalid schema key: $var"
    continue
  }

  value="${!var:-}"

  # -------------------------------
  # Safe rule parsing (NO assumptions)
  # -------------------------------
  IFS=':' read -r type required min max pattern <<< "${rule}::::"

  # -------------------------------
  # Required validation
  # -------------------------------
  if [[ "$required" == "true" && -z "$value" ]]; then
    fail "Missing required variable: $var"
  fi

  [[ -z "$value" ]] && continue

  # -------------------------------
  # Type validation (generic)
  # -------------------------------
  case "$type" in
    number)
      if ! is_number "$value"; then
        [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var must be a number" || warn "$var not numeric"
      fi
      ;;
    boolean)
      if ! is_boolean "$value"; then
        [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var must be boolean" || warn "$var not boolean"
      fi
      ;;
    string|"")
      # Always allowed
      ;;
    *)
      warn "Unknown type '$type' for $var"
      ;;
  esac

  # -------------------------------
  # Range validation (only if numeric)
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
  # Pattern validation (optional)
  # -------------------------------
  if [[ -n "$pattern" ]]; then
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
