#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/yq" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "-r" ]]; then
  echo "${FAKE_LANGUAGE:-}"
fi
exit 0
EOF

  cat > "$FAKE_BIN/npm" <<'EOF'
#!/usr/bin/env bash
echo "npm $*" >> "${NPM_CALLS:-/dev/null}"
exit 0
EOF

  cat > "$FAKE_BIN/pytest" <<'EOF'
#!/usr/bin/env bash
echo "pytest" >> "${PYTEST_CALLS:-/dev/null}"
exit 0
EOF

  cat > "$FAKE_BIN/go" <<'EOF'
#!/usr/bin/env bash
echo "go $*" >> "${GO_CALLS:-/dev/null}"
exit 0
EOF

  chmod +x "$FAKE_BIN/yq" "$FAKE_BIN/npm" "$FAKE_BIN/pytest" "$FAKE_BIN/go"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service name argument" {
  run bash -c "bash '$BATS_TEST_DIRNAME/../../ci/test.sh'"
  [ "$status" -eq 1 ]
}

@test "fails when service does not exist" {
  run bash -c "PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/test.sh' ghost-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service not found"* ]]
}

@test "runs npm test for node services" {
  export FAKE_LANGUAGE=node
  export NPM_CALLS="$TEMPDIR/npm-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' FAKE_LANGUAGE=node NPM_CALLS='$NPM_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/test.sh' auth-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Running Node tests"* ]]
  [[ "$(cat "$NPM_CALLS")" == *"test"* ]]
}

@test "runs pytest for python services" {
  export FAKE_LANGUAGE=python
  export PYTEST_CALLS="$TEMPDIR/pytest-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' FAKE_LANGUAGE=python PYTEST_CALLS='$PYTEST_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/test.sh' auth-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Running Python tests"* ]]
  [ -s "$PYTEST_CALLS" ]
}

@test "runs go test for go services" {
  export FAKE_LANGUAGE=go
  export GO_CALLS="$TEMPDIR/go-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' FAKE_LANGUAGE=go GO_CALLS='$GO_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/test.sh' auth-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Running Go tests"* ]]
  [[ "$(cat "$GO_CALLS")" == *"test ./..."* ]]
}

@test "fails for unknown language" {
  export FAKE_LANGUAGE=ruby
  run bash -c "PATH='$FAKE_BIN:$PATH' FAKE_LANGUAGE=ruby bash '$BATS_TEST_DIRNAME/../../ci/test.sh' auth-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown language: ruby"* ]]
}
