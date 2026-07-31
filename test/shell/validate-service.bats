#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/yq" <<'EOF'
#!/usr/bin/env bash
query="${2% // *}"
case "$query" in
  ".name") echo "valid-service" ;;
  ".language"|".runtime") echo "node" ;;
  ".docker.port"|".port") echo "8080" ;;
  ".deploy.healthcheck"|".health.path"|".health") echo "/health" ;;
  *) echo "" ;;
esac
EOF
  chmod +x "$FAKE_BIN/yq"

  export SVC="$TEMPDIR/services/valid-service"
  mkdir -p "$SVC/src"
  echo "name: valid-service" > "$SVC/service.yml"
  echo "FROM node:20" > "$SVC/Dockerfile"
  echo "console.log('x')" > "$SVC/src/main.js"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "passes a valid service" {
  run bash -c "cd '$TEMPDIR' && PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/validate-service.sh' valid-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Service validation passed: valid-service"* ]]
}

@test "fails when service directory is missing" {
  run bash -c "cd '$TEMPDIR' && PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/validate-service.sh' missing-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service directory not found"* ]]
}

@test "fails when Dockerfile is missing" {
  rm "$SVC/Dockerfile"
  run bash -c "cd '$TEMPDIR' && PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/validate-service.sh' valid-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Missing required file"* ]]
}

@test "fails when src directory is missing" {
  rm -rf "$SVC/src"
  run bash -c "cd '$TEMPDIR' && PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/validate-service.sh' valid-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Missing src/ directory"* ]]
}

@test "warns but passes when src is empty" {
  rm -f "$SVC/src/main.js"
  run bash -c "cd '$TEMPDIR' && PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/validate-service.sh' valid-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"src/ appears empty"* ]]
}

@test "skips yaml validation when yq is unavailable" {
  run bash -c "cd '$TEMPDIR' && PATH='$TEMPDIR/nobin:/usr/bin:/bin' bash '$BATS_TEST_DIRNAME/../../ci/validate-service.sh' valid-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"yq not installed"* ]]
}

@test "fails when yaml is missing required fields" {
  echo "name: valid-service" > "$SVC/service.yml"
  cat > "$FAKE_BIN/yq" <<'EOF'
#!/usr/bin/env bash
query="${2% // *}"
case "$query" in
  ".name") echo "valid-service" ;;
  ".language"|".runtime") echo "node" ;;
  ".docker.port"|".port") echo "8080" ;;
  *) echo "" ;;
esac
EOF
  run bash -c "cd '$TEMPDIR' && PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/validate-service.sh' valid-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Missing healthcheck"* ]]
}
