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
  run bash "$BATS_TEST_DIRNAME/../../ci/test-contract.sh"
  [ "$status" -eq 1 ]
}

@test "fails when service directory does not exist" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-contract.sh' ghost-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service directory not found"* ]]
}

@test "executes contract test script when present" {
  cat > "$SVC/test/contract.sh" <<'EOF'
#!/usr/bin/env bash
echo "running contract tests"
EOF
  chmod +x "$SVC/test/contract.sh"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-contract.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Contract tests passed"* ]]
}

@test "fails when contract test script fails" {
  cat > "$SVC/test/contract.sh" <<'EOF'
#!/usr/bin/env bash
exit 3
EOF
  chmod +x "$SVC/test/contract.sh"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-contract.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Contract tests failed"* ]]
}

@test "skips when no contract tests found" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/test-contract.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No contract tests found"* ]]
}
