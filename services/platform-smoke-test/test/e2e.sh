#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Running E2E tests..."
bash test/e2e/health-check.sh
