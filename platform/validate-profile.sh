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
  IFS=':' read -ra rule_fields <<< "${rule}::::"
  type="${rule_fields[0]:-}"
  required="${rule_fields[1]:-}"
  min="${rule_fields[2]:-}"
  max="${rule_fields[3]:-}"

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
        if [[ "$VALIDATION_MODE" == "strict" ]]; then
          fail "$var must be numeric"
        else
          warn "$var not numeric"
        fi
        continue   # 🔥 prevents double warnings
      fi
      ;;
    boolean)
      if ! is_boolean "$value"; then
        if [[ "$VALIDATION_MODE" == "strict" ]]; then
          fail "$var must be boolean"
        else
          warn "$var not boolean"
        fi
        continue
      fi
      ;;
    string)
      ;;
    port)
      if ! is_number "$value"; then
        if [[ "$VALIDATION_MODE" == "strict" ]]; then
          fail "$var must be a valid port"
        else
          warn "$var not a valid port"
        fi
        continue
      fi
      if [[ "$value" -lt 1 || "$value" -gt 65535 ]]; then
        if [[ "$VALIDATION_MODE" == "strict" ]]; then
          fail "$var out of port range (1-65535)"
        else
          warn "$var out of port range (1-65535)"
        fi
      fi
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
        if [[ "$VALIDATION_MODE" == "strict" ]]; then
          fail "$var < $min"
        else
          warn "$var below min"
        fi
      fi
    }

    [[ -n "$max" ]] && {
      if [[ "$value" -gt "$max" ]]; then
        if [[ "$VALIDATION_MODE" == "strict" ]]; then
          fail "$var > $max"
        else
          warn "$var above max"
        fi
      fi
    }

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
      if [[ "$VALIDATION_MODE" == "strict" ]]; then
        fail "Autoscale min > max"
      else
        warn "Autoscale bounds invalid"
      fi
    fi
  fi

fi

echo "✅ Platform config is valid"
