#!/usr/bin/env bash
set -euo pipefail

SCHEMA_FILE="${SCHEMA_FILE:-platform/schema.env}"

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

# -------------------------------
# Validation loop
# -------------------------------

while IFS='=' read -r var rule; do

  # skip comments / empty
  [[ "$var" =~ ^#.*$ || -z "$var" ]] && continue

  value="${!var:-}"

  IFS=':' read -r type required min max pattern <<< "$rule"

  # -------------------------------
  # Required check
  # -------------------------------
  if [[ "$required" == "true" && -z "$value" ]]; then
    echo "❌ Missing required variable: $var"
    exit 1
  fi

  # Skip if not set
  [[ -z "$value" ]] && continue

  # -------------------------------
  # Type validation
  # -------------------------------
  case "$type" in
    number)
      if ! is_number "$value"; then
        echo "❌ $var must be a number"
        exit 1
      fi
      ;;
    boolean)
      if ! is_boolean "$value"; then
        echo "❌ $var must be true/false"
        exit 1
      fi
      ;;
    string)
      ;;
  esac

  # -------------------------------
  # Range validation
  # -------------------------------
  if [[ "$type" == "number" ]]; then
    if [[ -n "${min:-}" && "$value" -lt "$min" ]]; then
      echo "❌ $var must be >= $min"
      exit 1
    fi

    if [[ -n "${max:-}" && "$value" -gt "$max" ]]; then
      echo "❌ $var must be <= $max"
      exit 1
    fi
  fi

done < "$SCHEMA_FILE"

# -------------------------------
# Cross-field validation (dynamic)
# -------------------------------

if [[ "${AUTOSCALE_ENABLED:-false}" == "true" ]]; then
  min="${AUTOSCALE_MIN_REPLICAS:-}"
  max="${AUTOSCALE_MAX_REPLICAS:-}"

  if [[ -n "$min" && -n "$max" && "$min" -gt "$max" ]]; then
    echo "❌ AUTOSCALE_MIN_REPLICAS cannot be greater than MAX"
    exit 1
  fi
fi

echo "✅ Platform config is valid"
