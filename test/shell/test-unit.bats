#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/npm" <<'EOF'
#!/usr/bin/env bash
echo "npm $*" >> "${NPM_CALLS:-/dev/null}"
if [[ "$1" == "run" ]]; then
  exit "${NPM_EXIT:-0}"
fi
exit 0
EOF
  chmod +x "$FAKE_BIN/npm"

  export SERVICES_DIR="$TEMPDIR/services"
  export PATH="$FAKE_BIN:$PATH"
  export SVC="$SERVICES_DIR/demo-service"
  mkdir -p "$SVC/src"
  echo "FROM node:20" > "$SVC/Dockerfile"
  echo '{"name":"demo-service","scripts":{"test":"mocha"}}' > "$SVC/package.json"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service name argument" {
  run bash "$BATS_TEST_DIRNAME/../../ci/test-unit.sh"
  [ "$status" -eq 1 ]
}

@test "fails when service directory does not exist" {
  run bash "$BATS_TEST_DIRNAME/../../ci/test-unit.sh" ghost-service
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service directory not found"* ]]
}

@test "installs dependencies and runs unit tests for node services" {
  export NPM_CALLS="$TEMPDIR/npm-calls.txt"
  run bash "$BATS_TEST_DIRNAME/../../ci/test-unit.sh" demo-service
  [ "$status" -eq 0 ]
  [[ "$output" == *"Unit tests passed"* ]]
  [[ "$(cat "$NPM_CALLS")" == *"ci"* ]]
  [[ "$(cat "$NPM_CALLS")" == *"run test"* ]]
}

@test "fails when unit tests fail" {
  export NPM_EXIT=1
  run bash "$BATS_TEST_DIRNAME/../../ci/test-unit.sh" demo-service
  [ "$status" -eq 1 ]
  [[ "$output" == *"Unit tests failed"* ]]
}

@test "skips gracefully when no package.json exists" {
  rm "$SVC/package.json"
  run bash "$BATS_TEST_DIRNAME/../../ci/test-unit.sh" demo-service
  [ "$status" -eq 0 ]
  [[ "$output" == *"No Node.js project detected"* ]]
}

@test "uses SERVICES_DIR override" {
  export NPM_CALLS="$TEMPDIR/npm-calls.txt"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' NPM_CALLS='$NPM_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/test-unit.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Unit tests passed"* ]]
}
