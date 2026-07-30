#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Running integration tests..."
npx c8 mocha 'test/integration/**/*.js' --reporter spec --timeout 10000
