#!/usr/bin/env bash
set -euo pipefail

SERVICE_URL="${1:?Usage: $0 <service-url>}"
HEALTH_URL="$SERVICE_URL/health"

echo "Running smoke test on $HEALTH_URL"

MAX_RETRIES=10
SLEEP_TIME=5

for i in $(seq 1 $MAX_RETRIES); do
  echo "Attempt $i/$MAX_RETRIES..."

  if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null; then
    echo "Smoke test passed"
    exit 0
  fi

  echo "Service not ready yet. Waiting $SLEEP_TIME seconds..."
  sleep $SLEEP_TIME
done

echo "Smoke test failed after $MAX_RETRIES attempts"
exit 1
