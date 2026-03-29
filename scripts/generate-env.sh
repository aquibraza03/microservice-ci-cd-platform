#!/usr/bin/env bash
set -euo pipefail

SCHEMA_FILE="${SCHEMA_FILE:-platform/schema.env}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
OUTPUT_DIR="${OUTPUT_DIR:-environments/$ENVIRONMENT}"
OUTPUT_FILE="${OUTPUT_FILE:-$OUTPUT_DIR/env.example}"

OVERWRITE="${OVERWRITE:-true}"
VERBOSE="${VERBOSE:-true}"

log()  { [[ "$VERBOSE" == "true" ]] && echo "ℹ️  $1" >&2; }
pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }

[[ -f "$SCHEMA_FILE" ]] || fail "Schema file not found: $SCHEMA_FILE"
mkdir -p "$OUTPUT_DIR"

if [[ -f "$OUTPUT_FILE" && "$OVERWRITE" != "true" ]]; then
  fail "File exists: $OUTPUT_FILE (set OVERWRITE=true to replace)"
fi

log "Generating env file"
log "Schema: $SCHEMA_FILE"
log "Output: $OUTPUT_FILE"

trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf "%s" "$v"
}

TMP_FILE="$(mktemp "${OUTPUT_FILE}.XXXX")"

{
  echo "# =================================="
  echo "# Environment: $ENVIRONMENT"
  echo "# Generated from: $SCHEMA_FILE"
  echo "# =================================="
  echo ""

  current_section=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    line="$(trim "$line")"

    [[ -z "$line" ]] && continue

    if [[ "$line" =~ ^## ]]; then
      section="${line#\#\# }"
      if [[ "$section" != "$current_section" ]]; then
        echo ""
        echo "# =================================="
        echo "# $section"
        echo "# =================================="
        echo ""
        current_section="$section"
      fi
      continue
    fi

    [[ "$line" =~ ^# ]] && continue
    [[ "$line" != *=* ]] && continue

    var="$(trim "${line%%=*}")"
    rule="$(trim "${line#*=}")"

    IFS=':' read -r type required min max default <<< "$rule"

    min="${min:-}"
    max="${max:-}"
    default="${default:-}"

    echo "# ----------------------------------"
    echo "# $var"

    [[ -n "$type" ]] && echo "# type: $type"
    [[ "$required" == "true" ]] && echo "# required"
    [[ -n "$min" ]] && echo "# min: $min"
    [[ -n "$max" ]] && echo "# max: $max"

    if [[ -n "$default" ]]; then
      echo "# default: $default"
      echo "$var=$default"
    else
      echo "$var="
    fi

    echo ""

  done < "$SCHEMA_FILE"

} > "$TMP_FILE"

mv "$TMP_FILE" "$OUTPUT_FILE"
pass "Generated: $OUTPUT_FILE"
