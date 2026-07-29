#!/usr/bin/env bash
set -euo pipefail

STATUS="${1:-success}"
MESSAGE="${2:-No message provided}"

echo "[NOTIFY] Status: $STATUS"
echo "[NOTIFY] Message: $MESSAGE"

case "$STATUS" in
  success)
    echo "[NOTIFY] Pipeline succeeded: $MESSAGE"
    ;;
  failure)
    echo "[NOTIFY] Pipeline failed: $MESSAGE" >&2
    ;;
  *)
    echo "[NOTIFY] Unknown status: $STATUS"
    ;;
esac
