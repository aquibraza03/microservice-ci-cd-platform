#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
ENV_FILE="${ENV_FILE:-environments/$ENVIRONMENT/env.example}"
SCHEMA_FILE="${SCHEMA_FILE:-platform/schema.env}"
EXAMPLE_FILE="${EXAMPLE_FILE:-.env.example}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-text}"
STRICT="${STRICT:-false}"

FAILURES=0
WARNINGS=0

ERRORS=()
WARNINGS_LIST=()

pass() { [[ "$OUTPUT_FORMAT" == "text" ]] && echo "✅ $1"; }

fail() {
  [[ "$OUTPUT_FORMAT" == "text" ]] && echo "❌ $1"
  ERRORS+=("$1")
  ((FAILURES++))
}

warn() {
  [[ "$OUTPUT_FORMAT" == "text" ]] && echo "⚠️ $1"
  WARNINGS_LIST+=("$1")
  ((WARNINGS++))
}

trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf "%s" "$v"
}

strip_quotes() {
  local v="$1"
  v="${v%\"}"; v="${v#\"}"
  v="${v%\'}"; v="${v#\'}"
  printf "%s" "$v"
}

escape_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  printf "%s" "$s"
}

# -------------------------------
# Check env file
# -------------------------------
[[ -f "$ENV_FILE" ]] || { fail "Missing env file ($ENV_FILE)"; exit 1; }

# -------------------------------
# Parse ENV
# -------------------------------
declare -A ENV_VARS

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line//$'\r'/}"
  line="$(trim "$line")"

  [[ -z "$line" || "$line" =~ ^# ]] && continue
  [[ "$line" != *=* ]] && { warn "Invalid line: $line"; continue; }

  key="$(trim "${line%%=*}")"
  value="$(trim "${line#*=}")"
  value="$(strip_quotes "$value")"

  [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && { warn "Invalid key: $key"; continue; }

  [[ -n "${ENV_VARS[$key]:-}" ]] && warn "Duplicate key: $key"

  ENV_VARS["$key"]="$value"

done < "$ENV_FILE"

pass "Parsed environment"

# -------------------------------
# Schema validation (FIXED)
# -------------------------------
declare -A SCHEMA_VARS

if [[ -f "$SCHEMA_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    line="$(trim "$line")"

    [[ -z "$line" || "$line" =~ ^# ]] && continue
    [[ "$line" != *=* ]] && { warn "Invalid schema line: $line"; continue; }

    var="$(trim "${line%%=*}")"
    rule="$(trim "${line#*=}")"

    SCHEMA_VARS["$var"]=1

    # -------------------------------
    # NEW PARSER (correct)
    # -------------------------------
    IFS=':' read -r type required min max default <<< "$rule"

    min="${min:-}"
    max="${max:-}"
    default="${default:-}"

    value="${ENV_VARS[$var]:-}"

    # Required
    [[ "$required" == "true" && -z "$value" ]] && { fail "$var required"; continue; }

    [[ -z "$value" ]] && continue

    # -------------------------------
    # Type validation
    # -------------------------------
    case "$type" in
      number)
        [[ "$value" =~ ^[0-9]+$ ]] || warn "$var should be number"
        ;;
      boolean)
        [[ "$value" =~ ^(true|false)$ ]] || warn "$var should be boolean"
        ;;
      port)
        [[ "$value" =~ ^[0-9]+$ && "$value" -ge 1 && "$value" -le 65535 ]] || warn "$var invalid port"
        ;;
      string|"")
        ;;
      *)
        warn "Unknown type '$type' for $var"
        ;;
    esac

    # -------------------------------
    # Range validation (NEW)
    # -------------------------------
    if [[ "$type" == "number" || "$type" == "port" ]]; then
      if [[ -n "$min" && "$value" -lt "$min" ]]; then
        warn "$var below minimum ($min)"
      fi
      if [[ -n "$max" && "$value" -gt "$max" ]]; then
        warn "$var above maximum ($max)"
      fi
    fi

  done < "$SCHEMA_FILE"
else
  warn "No schema file"
fi

# -------------------------------
# Unknown variables
# -------------------------------
for k in "${!ENV_VARS[@]}"; do
  [[ -z "${SCHEMA_VARS[$k]:-}" ]] && warn "$k not in schema"
done

# -------------------------------
# Empty values
# -------------------------------
for k in "${!ENV_VARS[@]}"; do
  [[ -z "${ENV_VARS[$k]}" ]] && warn "$k empty"
done

# -------------------------------
# Output
# -------------------------------
if [[ "$OUTPUT_FORMAT" == "text" ]]; then
  echo ""
  echo "📊 Summary:"
  echo " - Failures: $FAILURES"
  echo " - Warnings: $WARNINGS"
fi

# -------------------------------
# Strict mode
# -------------------------------
if [[ "$STRICT" == "true" && "$WARNINGS" -gt 0 ]]; then
  [[ "$OUTPUT_FORMAT" == "text" ]] && echo "❌ Warnings treated as failures"
  exit 1
fi

[[ "$FAILURES" -gt 0 ]] && exit 1
