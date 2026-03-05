#!/usr/bin/env bash
set -euo pipefail

SERVICES_DIR="services"

echo "🔍 Detecting changed services..."

# Get changed files from last commit
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD || true)

SERVICES=()

for file in $CHANGED_FILES; do
  # Check if file belongs to services folder
  if [[ "$file" == $SERVICES_DIR/* ]]; then

    # Extract service name
    SERVICE=$(echo "$file" | cut -d'/' -f2)

    # Verify service.yml exists (valid service)
    if [ -f "$SERVICES_DIR/$SERVICE/service.yml" ]; then
      
      # Avoid duplicates
      if [[ ! " ${SERVICES[*]} " =~ " ${SERVICE} " ]]; then
        SERVICES+=("$SERVICE")
      fi

    fi
  fi
done

if [ ${#SERVICES[@]} -eq 0 ]; then
  echo "No services changed"
  exit 0
fi

echo "Changed services:"
printf '%s\n' "${SERVICES[@]}"

# GitHub Actions output
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "services=${SERVICES[*]}" >> "$GITHUB_OUTPUT"
fi
