#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
echo "curl $*" >> "${CURL_CALLS:-/dev/null}"
exit "${CURL_EXIT:-0}"
EOF

  cat > "$FAKE_BIN/sleep" <<'EOF'
#!/usr/bin/env bash
echo "sleep $*" >> "${SLEEP_CALLS:-/dev/null}"
exit 0
EOF

  chmod +x "$FAKE_BIN/curl" "$FAKE_BIN/sleep"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service URL argument" {
  run bash "$BATS_TEST_DIRNAME/../../ci/smoke-test.sh"
  [ "$status" -eq 1 ]
}

@test "passes when the health endpoint responds" {
  run bash -c "PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/smoke-test.sh' http://localhost:8080"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Smoke test passed"* ]]
}

@test "hits the /health endpoint" {
  export CURL_CALLS="$TEMPDIR/curl-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' CURL_CALLS='$CURL_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/smoke-test.sh' http://svc:3000"
  [ "$status" -eq 0 ]
  [[ "$(cat "$CURL_CALLS")" == *"http://svc:3000/health"* ]]
}

@test "fails after exhausting retries when the endpoint is unreachable" {
  export CURL_CALLS="$TEMPDIR/curl-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' CURL_EXIT=1 CURL_CALLS='$CURL_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/smoke-test.sh' http://localhost:8080"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Smoke test failed"* ]]
  [[ "$(wc -l < "$CURL_CALLS")" -ge 10 ]]
}
