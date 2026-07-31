#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/yq" <<'EOF'
#!/usr/bin/env bash
exit "${YQ_EXIT:-0}"
EOF
  chmod +x "$FAKE_BIN/yq"

  export PROJECT="$TEMPDIR/project"
  export SVC="$PROJECT/services/valid-service"
  mkdir -p "$SVC/src"
  echo "name: valid-service" > "$SVC/service.yml"
  echo "FROM node:20" > "$SVC/Dockerfile"
  echo "console.log('x')" > "$SVC/src/main.js"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service name argument" {
  run bash -c "cd '$PROJECT' && SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh'"
  [ "$status" -eq 1 ]
}

@test "validates a compliant service" {
  run bash -c "cd '$PROJECT' && PATH='$FAKE_BIN:$PATH' SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh' valid-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid-service passed all policy checks"* ]]
}

@test "fails when service directory is missing" {
  run bash -c "cd '$PROJECT' && PATH='$FAKE_BIN:$PATH' SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh' ghost-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service directory missing"* ]]
}

@test "fails when service.yml is missing" {
  rm "$SVC/service.yml"
  run bash -c "cd '$PROJECT' && PATH='$FAKE_BIN:$PATH' SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh' valid-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"service.yml required"* ]]
}

@test "fails when src directory is empty" {
  rm "$SVC/src/main.js"
  run bash -c "cd '$PROJECT' && PATH='$FAKE_BIN:$PATH' SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh' valid-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"src directory empty"* ]]
}

@test "fails when Dockerfile has no FROM instruction" {
  echo "RUN echo hi" > "$SVC/Dockerfile"
  run bash -c "cd '$PROJECT' && PATH='$FAKE_BIN:$PATH' SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh' valid-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Dockerfile missing FROM instruction"* ]]
}

@test "fails on invalid YAML when yq is available" {
  YQ_EXIT=1
  run bash -c "cd '$PROJECT' && PATH='$FAKE_BIN:$PATH' YQ_EXIT=1 SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh' valid-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Invalid YAML in service.yml"* ]]
}

@test "matrix mode validates each listed service" {
  mkdir -p "$PROJECT/services/other-service/src"
  echo "FROM alpine" > "$PROJECT/services/other-service/Dockerfile"
  echo "name: other-service" > "$PROJECT/services/other-service/service.yml"
  echo "x" > "$PROJECT/services/other-service/src/x.txt"

  run bash -c "cd '$PROJECT' && PATH='$FAKE_BIN:$PATH' CI_SERVICE_LIST='valid-service,other-service' SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh' matrix"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid-service passed all policy checks"* ]]
  [[ "$output" == *"other-service passed all policy checks"* ]]
}

@test "warns when package.json lacks scripts" {
  echo '{"name":"valid-service"}' > "$SVC/package.json"
  run bash -c "cd '$PROJECT' && PATH='$FAKE_BIN:$PATH' SERVICES_DIR='$PROJECT/services' bash '$BATS_TEST_DIRNAME/../../ci/policy.sh' valid-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"package.json missing scripts"* ]]
}
