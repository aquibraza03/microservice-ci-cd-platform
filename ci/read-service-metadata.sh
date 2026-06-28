#!/usr/bin/env bash
set -Eeuo pipefail

############################################################
# Service Metadata Reader
#
# Usage:
#
# ./ci/read-service-metadata.sh <service> <key>
#
# Example:
#
# ./ci/read-service-metadata.sh auth-service deploy.type
# ./ci/read-service-metadata.sh auth-service deploy.healthcheck
#
############################################################

SERVICE="${1:?Service required}"
KEY="${2:?Metadata key required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="$ROOT_DIR/services/${SERVICE}/service.yml"

############################################################
# Logging
############################################################

log_error() {
    echo "[metadata] ERROR: $*" >&2
}

############################################################
# Validate metadata file
############################################################

if [[ ! -f "$FILE" ]]; then
    log_error "Service metadata not found: $FILE"
    exit 1
fi

############################################################
# Validate key
############################################################

if [[ ! "$KEY" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
    log_error "Invalid metadata key: $KEY"
    exit 1
fi

############################################################
# Locate yq
############################################################

if command -v yq >/dev/null 2>&1; then
    YQ="yq"
elif [[ -x "$ROOT_DIR/bin/yq" ]]; then
    YQ="$ROOT_DIR/bin/yq"
elif [[ -x "$ROOT_DIR/bin/yq.exe" ]]; then
    YQ="$ROOT_DIR/bin/yq.exe"
else
    log_error "yq is required but not installed."
    exit 1
fi

############################################################
# Read metadata
############################################################

if ! VALUE="$("$YQ" -r ".$KEY // \"\"" "$FILE")"; then
    log_error "Failed to parse YAML file: $FILE"
    exit 1
fi

############################################################
# Validate value
############################################################

if [[ -z "$VALUE" || "$VALUE" == "null" ]]; then
    log_error "Metadata key not found: $KEY"
    exit 1
fi

############################################################
# Output value
############################################################

echo "$VALUE"
