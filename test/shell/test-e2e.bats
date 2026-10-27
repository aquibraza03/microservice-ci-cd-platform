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
  run bash "$BATS_TEST_DIRNAME/../../ci/test-e2e.sh"
  [ "$status" -eq 1 ]
}

@test "fails when service directory does not exist" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-e2e.sh' ghost-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service directory not found"* ]]
}

@test "executes e2e test script when present" {
  cat > "$SVC/test/e2e.sh" <<'EOF'
#!/usr/bin/env bash
echo "running e2e tests"
EOF
  chmod +x "$SVC/test/e2e.sh"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-e2e.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"E2E tests passed"* ]]
}

@test "fails when e2e test script fails" {
  cat > "$SVC/test/e2e.sh" <<'EOF'
#!/usr/bin/env bash
echo "boom" >&2
exit 2
EOF
  chmod +x "$SVC/test/e2e.sh"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-e2e.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"E2E tests failed"* ]]
}

@test "skips when no e2e tests found" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-e2e.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No E2E tests found"* ]]
}
