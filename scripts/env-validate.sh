#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${ENVIRONMENT:-dev}"
ENV_FILE="${ENV_FILE:-environments/$ENVIRONMENT/env.example}"
SCHEMA_FILE="${SCHEMA_FILE:-platform/schema.env}"
EXAMPLE_FILE="${EXAMPLE_FILE:-.env.example}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-text}"   # text | json
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
# Schema validation
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

    IFS=':' read -r type required allowed regex extra <<< "${rule}::::"
    [[ -n "${extra:-}" ]] && warn "Invalid schema format for $var"

    value="${ENV_VARS[$var]:-}"

    [[ "$required" == "true" && -z "$value" ]] && { fail "$var required"; continue; }
    [[ -z "$value" ]] && continue

    case "$type" in
      number) [[ "$value" =~ ^[0-9]+$ ]] || warn "$var should be number" ;;
      boolean) [[ "$value" =~ ^(true|false)$ ]] || warn "$var should be boolean" ;;
      port) [[ "$value" =~ ^[0-9]+$ && "$value" -ge 1 && "$value" -le 65535 ]] || warn "$var invalid port" ;;
      url) [[ "$value" =~ ^https?:// ]] || warn "$var invalid url" ;;
      string|"") ;;
      *) warn "Unknown type '$type' for $var" ;;
    esac

    # Enum validation
    if [[ -n "$allowed" ]]; then
      IFS='|' read -ra opts <<< "$allowed"
      valid=false
      for o in "${opts[@]}"; do
        [[ "$o" == "$value" ]] && valid=true && break
      done
      [[ "$valid" == false ]] && warn "$var must be one of [$allowed]"
    fi

    # Regex validation
    [[ -n "$regex" && ! "$value" =~ $regex ]] && warn "$var invalid format"

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
# .env.example validation
# -------------------------------
if [[ -f "$EXAMPLE_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    line="$(trim "$line")"

    [[ -z "$line" || "$line" =~ ^# ]] && continue

    key="$(trim "${line%%=*}")"

    [[ -z "${ENV_VARS[$key]:-}" ]] && warn "$key missing (from example)"

  done < "$EXAMPLE_FILE"
fi

# -------------------------------
# Output
# -------------------------------
if [[ "$OUTPUT_FORMAT" == "text" ]]; then
  echo ""
  echo "📊 Summary:"
  echo " - Failures: $FAILURES"
  echo " - Warnings: $WARNINGS"
fi

# JSON output
if [[ "$OUTPUT_FORMAT" == "json" ]]; then
  printf '{\n'
  printf '  "failures": %d,\n' "$FAILURES"
  printf '  "warnings": %d,\n' "$WARNINGS"

  printf '  "errors": ['
  for i in "${!ERRORS[@]}"; do
    printf '"%s"' "$(escape_json "${ERRORS[$i]}")"
    [[ $i -lt $((${#ERRORS[@]} - 1)) ]] && printf ','
  done
  printf '],\n'

  printf '  "warnings_list": ['
  for i in "${!WARNINGS_LIST[@]}"; do
    printf '"%s"' "$(escape_json "${WARNINGS_LIST[$i]}")"
    [[ $i -lt $((${#WARNINGS_LIST[@]} - 1)) ]] && printf ','
  done
  printf ']\n'

  printf '}\n'
fi

# -------------------------------
# Strict mode
# -------------------------------
if [[ "$STRICT" == "true" && "$WARNINGS" -gt 0 ]]; then
  [[ "$OUTPUT_FORMAT" == "text" ]] && echo "❌ Warnings treated as failures"
  exit 1
fi

# -------------------------------
# Final exit
# -------------------------------
[[ "$FAILURES" -gt 0 ]] && exit 1
