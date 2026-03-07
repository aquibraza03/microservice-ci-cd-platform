#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SERVICES_DIR="services"

echo "🔎 Generating service matrix..."

SERVICES=()

# Scan services directory
for service in "$SERVICES_DIR"/*/; do
  if [[ -f "$service/service.yml" && -r "$service/service.yml" ]]; then
    name=$(basename "$service")
    echo "✔ Found service: $name"
    SERVICES+=("$name")
  fi
done

# No services found
if [[ ${#SERVICES[@]} -eq 0 ]]; then
  echo "⚠️ No services found"
  exit 0
fi

# Convert to JSON array safely
JSON_SERVICES=()
for svc in "${SERVICES[@]}"; do
  JSON_SERVICES+=("\"$svc\"")
done

MATRIX=$(printf ",%s" "${JSON_SERVICES[@]}")
MATRIX="[${MATRIX:1}]"

echo ""
echo "Generated matrix:"
echo "$MATRIX"

# GitHub Actions output
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "services=$MATRIX" >> "$GITHUB_OUTPUT"
fi

# Standard output (for Jenkins or local use)
echo "$MATRIX"
