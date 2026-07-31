#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo "  Shell Test Runner - BATS Test Suite"
echo "============================================"
echo ""

TOTAL_TESTS=0
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0

FAILED_SUITES=()

for bats_file in "$SCRIPT_DIR"/*.bats; do
  name=$(basename "$bats_file" .bats)
  echo "--------------------------------------------"
  echo "  Suite: $name"
  echo "--------------------------------------------"

  set +e
  bats_output=$(bats --formatter tap "$bats_file" 2>&1)
  bats_exit=$?
  set -e

  # Keep stdout/stderr readable in the pipeline log
  echo "$bats_output" | grep -E '^(ok|not ok)' || true

  # Parse TAP output
  while IFS= read -r line; do
    if [[ "$line" =~ ^ok\ [0-9]+[[:space:]]+(.*)$ ]]; then
      if [[ "$line" == *"# skip"* ]]; then
        TOTAL_SKIP=$((TOTAL_SKIP + 1))
      else
        TOTAL_PASS=$((TOTAL_PASS + 1))
      fi
      TOTAL_TESTS=$((TOTAL_TESTS + 1))
    elif [[ "$line" =~ ^not\ ok ]]; then
      TOTAL_FAIL=$((TOTAL_FAIL + 1))
      TOTAL_TESTS=$((TOTAL_TESTS + 1))
    fi
  done <<< "$bats_output"

  if [[ "$bats_exit" -ne 0 ]]; then
    FAILED_SUITES+=("$name")
  fi

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

if [[ ${#FAILED_SUITES[@]} -gt 0 ]]; then
  echo "Failed suites:"
  printf '  - %s\n' "${FAILED_SUITES[@]}"
  exit 1
fi

echo "All shell test suites passed."
exit 0
