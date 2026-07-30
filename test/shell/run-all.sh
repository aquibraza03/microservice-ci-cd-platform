#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUMMARY_FILE=$(mktemp)

echo "============================================"
echo "  Shell Test Runner - BATS Test Suite"
echo "============================================"
echo ""

TOTAL_TESTS=0
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0

for bats_file in "$SCRIPT_DIR"/*.bats; do
  name=$(basename "$bats_file" .bats)
  echo "--------------------------------------------"
  echo "  Suite: $name"
  echo "--------------------------------------------"

  set +e
  bats_output=$(bats --detailed-output "$bats_file" 2>&1)
  bats_exit=$?
  set -e

  echo "$bats_output"

  # Parse results
  while IFS= read -r line; do
    if [[ "$line" =~ ^([0-9]+)\ tests,\ ([0-9]+)\ failures,\ ([0-9]+)\ skipped$ ]]; then
      TOTAL_TESTS=$((TOTAL_TESTS + BASH_REMATCH[1]))
      TOTAL_PASS=$((TOTAL_PASS + BASH_REMATCH[1] - BASH_REMATCH[2] - BASH_REMATCH[3]))
      TOTAL_FAIL=$((TOTAL_FAIL + BASH_REMATCH[2]))
      TOTAL_SKIP=$((TOTAL_SKIP + BASH_REMATCH[3]))
    fi
  done < <(echo "$bats_output" | tail -5)

  echo ""
done

echo "============================================"
echo "  FINAL SUMMARY"
echo "============================================"
echo "  Total suites: $(ls "$SCRIPT_DIR"/*.bats 2>/dev/null | wc -l)"
echo "  Total tests:  $TOTAL_TESTS"
echo "  Passed:       $TOTAL_PASS"
echo "  Failed:       $TOTAL_FAIL"
echo "  Skipped:      $TOTAL_SKIP"
echo "============================================"

rm -f "$SUMMARY_FILE"

if [[ "$TOTAL_FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
