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
# Validation loop (SAFE + CLEAN)
# -------------------------------
while IFS= read -r line || [[ -n "$line" ]]; do

  line="$(echo "$line" | xargs)"

  [[ -z "$line" || "$line" =~ ^# ]] && continue

  [[ "$line" != *"="* ]] && {
    warn "Skipping invalid schema line: $line"
    continue
  }

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
  # Safe rule parsing
  # -------------------------------
  IFS=':' read -r type required min max pattern <<< "${rule}::::"

  [[ -z "$type" ]] && continue

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
        [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var must be numeric" || warn "$var not numeric"
        continue   # 🔥 prevents double warnings
      fi
      ;;
    boolean)
      if ! is_boolean "$value"; then
        [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var must be boolean" || warn "$var not boolean"
        continue
      fi
      ;;
    string)
      ;;
    *)
      warn "Unknown type '$type' for $var"
      continue
      ;;
  esac

  # -------------------------------
  # Range validation (only if defined)
  # -------------------------------
  if [[ "$type" == "number" && "$value" =~ ^[0-9]+$ ]]; then

    [[ -n "$min" ]] && {
      if [[ "$value" -lt "$min" ]]; then
        [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var < $min" || warn "$var below min"
      fi
    }

    [[ -n "$max" ]] && {
      if [[ "$value" -gt "$max" ]]; then
        [[ "$VALIDATION_MODE" == "strict" ]] && fail "$var > $max" || warn "$var above max"
      fi
    }

  fi

  # -------------------------------
  # Pattern validation (ONLY if explicitly defined)
  # -------------------------------
  if [[ "$rule" == *:*:*:*:* && -n "$pattern" ]]; then
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

  if is_number "$min" && is_number "$max"; then
    if [[ "$min" -gt "$max" ]]; then
      [[ "$VALIDATION_MODE" == "strict" ]] && fail "Autoscale min > max" || warn "Autoscale bounds invalid"
    fi
  fi

fi

echo "✅ Platform config is valid"
