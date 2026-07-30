#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Running contract tests..."
npx c8 mocha 'test/contract/**/*.js' --reporter spec --timeout 5000
