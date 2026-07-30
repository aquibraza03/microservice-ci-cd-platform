#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export GIT_DIR="$TEMPDIR/git"
  mkdir -p "$GIT_DIR/services/auth-service"
  mkdir -p "$GIT_DIR/services/orders-service"
  mkdir -p "$GIT_DIR/services/payments-service"

  pushd "$GIT_DIR" >/dev/null
  git init 2>/dev/null
  git checkout -b main 2>/dev/null || true
  git config user.email "test@test.com"
  git config user.name "Test"

  # Create service.yml files
  echo "name: auth-service" > services/auth-service/service.yml
  echo "name: orders-service" > services/orders-service/service.yml

  # Create a non-service file in payments
  echo "random" > services/payments-service/readme.txt

  git add -A
  git commit -m "initial commit" >/dev/null 2>&1
  popd >/dev/null

  # Override SERVICES_DIR for testing by using actual repo dir
  export GIT_DIR
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "detects changed services from git diff" {
  pushd "$GIT_DIR" >/dev/null
  echo "change" >> services/auth-service/service.yml
  git add -A
  git commit -m "update auth" >/dev/null 2>&1
  popd >/dev/null

  run bash "$BATS_TEST_DIRNAME/../../ci/detect-services.sh"
  workdir "$GIT_DIR"
  [ "$status" -eq 0 ]
}

@test "outputs changed services" {
  pushd "$GIT_DIR" >/dev/null
  echo "change" >> services/auth-service/service.yml
  git add -A
  git commit -m "update auth" >/dev/null 2>&1
  popd >/dev/null

  run bash -c "cd '$GIT_DIR' && bash '$BATS_TEST_DIRNAME/../../ci/detect-services.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"auth-service"* ]]
}

@test "reports no services changed when none are modified" {
  run bash -c "cd '$GIT_DIR' && bash '$BATS_TEST_DIRNAME/../../ci/detect-services.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No services changed"* ]]
}

@test "ignores services without service.yml" {
  pushd "$GIT_DIR" >/dev/null
  echo "change" >> services/payments-service/readme.txt
  git add -A
  git commit -m "update payments" >/dev/null 2>&1
  popd >/dev/null

  run bash -c "cd '$GIT_DIR' && bash '$BATS_TEST_DIRNAME/../../ci/detect-services.sh'"
  [[ "$output" == *"No services changed"* ]]
}

@test "writes to GITHUB_OUTPUT when set" {
  local output_file="$TEMPDIR/gh_output.txt"
  export GITHUB_OUTPUT="$output_file"

  pushd "$GIT_DIR" >/dev/null
  echo "change" >> services/auth-service/service.yml
  git add -A
  git commit -m "update auth" >/dev/null 2>&1
  popd >/dev/null

  run bash -c "cd '$GIT_DIR' && GITHUB_OUTPUT='$output_file' bash '$BATS_TEST_DIRNAME/../../ci/detect-services.sh'"
  [ "$status" -eq 0 ]
  [ -f "$output_file" ]
  [[ "$(cat '$output_file')" == *"services=auth-service"* ]]
}

@test "handles services directory at repo root" {
  pushd "$GIT_DIR" >/dev/null
  echo "change" >> services/auth-service/service.yml
  echo "change" >> services/orders-service/service.yml
  git add -A
  git commit -m "update both" >/dev/null 2>&1
  popd >/dev/null

  run bash -c "cd '$GIT_DIR' && bash '$BATS_TEST_DIRNAME/../../ci/detect-services.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"auth-service"* ]]
  [[ "$output" == *"orders-service"* ]]
}
