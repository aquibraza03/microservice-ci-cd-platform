#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export SERVICES_DIR="$TEMPDIR/services"
  export SVC="$SERVICES_DIR/demo-service"
  mkdir -p "$SVC/test"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service name argument" {
  run bash "$BATS_TEST_DIRNAME/../../ci/test-integration.sh"
  [ "$status" -eq 1 ]
}

@test "fails when service directory does not exist" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-integration.sh' ghost-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service directory not found"* ]]
}

@test "executes integration test script when present" {
  cat > "$SVC/test/integration.sh" <<'EOF'
#!/usr/bin/env bash
echo "running integration tests"
EOF
  chmod +x "$SVC/test/integration.sh"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-integration.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Integration tests passed"* ]]
}

@test "fails when integration test script fails" {
  cat > "$SVC/test/integration.sh" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "$SVC/test/integration.sh"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-integration.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Integration tests failed"* ]]
}

@test "skips when no integration tests found" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-integration.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No integration tests found"* ]]
}
