#!/usr/bin/env bash
set -euo pipefail

SERVICE="$1"

if [[ -z "${AWS_REGION:-}" ]]; then
  echo "⚠️ AWS not configured → skipping"
  exit 0
fi

bash deploy/ecs/deploy.sh "$SERVICE"
