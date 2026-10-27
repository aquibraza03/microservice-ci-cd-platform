#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Running unit tests..."
npx c8 mocha 'test/unit/**/*.js' --reporter spec --timeout 5000
