#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  # Create services directory with service.yml files
  mkdir -p "$TEMPDIR/services/auth-service"
  mkdir -p "$TEMPDIR/services/orders-service"
  mkdir -p "$TEMPDIR/services/payments-service"
  mkdir -p "$TEMPDIR/services/empty-service"

  echo "name: auth-service" > "$TEMPDIR/services/auth-service/service.yml"
  echo "name: orders-service" > "$TEMPDIR/services/orders-service/service.yml"
  echo "name: payments-service" > "$TEMPDIR/services/payments-service/service.yml"
  # empty-service has no service.yml
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "generates JSON matrix from services with service.yml" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../ci/service-matrix.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"\"auth-service\""* ]]
  [[ "$output" == *"\"orders-service\""* ]]
  [[ "$output" == *"\"payments-service\""* ]]
}

@test "outputs valid JSON array format" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../ci/service-matrix.sh'"
  [ "$status" -eq 0 ]
  # Should contain a JSON array on a line by itself
  [[ "$output" == *"[\"auth-service\""* ]]
  [[ "$output" == *"\"payments-service\"]"* ]]
}

@test "reports no services when directory is empty" {
  local empty_dir="$TEMPDIR/empty_project"
  mkdir -p "$empty_dir/services"

  run bash -c "cd '$empty_dir' && bash '$BATS_TEST_DIRNAME/../../ci/service-matrix.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No services found"* ]]
}

@test "skips directories without service.yml" {
  local mixed_dir="$TEMPDIR/mixed"
  mkdir -p "$mixed_dir/services/valid-service"
  mkdir -p "$mixed_dir/services/no-yml-service"
  echo "name: valid" > "$mixed_dir/services/valid-service/service.yml"

  run bash -c "cd '$mixed_dir' && bash '$BATS_TEST_DIRNAME/../../ci/service-matrix.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid-service"* ]]
  [[ "$output" != *"no-yml-service"* ]]
}

@test "writes matrix to GITHUB_OUTPUT when set" {
  local output_file="$TEMPDIR/gh_output.txt"

  run bash -c "cd '$TEMPDIR' && GITHUB_OUTPUT='$output_file' bash '$BATS_TEST_DIRNAME/../../ci/service-matrix.sh'"
  [ "$status" -eq 0 ]
  [ -f "$output_file" ]
  content=$(cat "$output_file")
  [[ "$content" == *"services="* ]]
}

@test "handles single service correctly" {
  local single_dir="$TEMPDIR/single"
  mkdir -p "$single_dir/services/only-service"
  echo "name: only" > "$single_dir/services/only-service/service.yml"

  run bash -c "cd '$single_dir' && bash '$BATS_TEST_DIRNAME/../../ci/service-matrix.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *'["only-service"]'* ]]
}
