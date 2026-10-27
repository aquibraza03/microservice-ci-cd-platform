#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  # Create a minimal project structure
  mkdir -p "$TEMPDIR/ci"
  mkdir -p "$TEMPDIR/platform/profiles"
  mkdir -p "$TEMPDIR/scripts"
  mkdir -p "$TEMPDIR/services/example-service/src"
  touch "$TEMPDIR/platform/defaults.env"
  touch "$TEMPDIR/platform/schema.env"
  touch "$TEMPDIR/services/example-service/service.yml"
  touch "$TEMPDIR/services/example-service/src/.gitkeep"

  pushd "$TEMPDIR" >/dev/null
  git init 2>/dev/null
  git checkout -b main 2>/dev/null || true
  git config user.email "test@test.com"
  git config user.name "Test"
  git add -A
  git commit -m "initial" >/dev/null 2>&1
  popd >/dev/null
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "reports required tools (bash, git, curl)" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"bash"* ]]
  [[ "$output" == *"git"* ]]
  [[ "$output" == *"curl"* ]]
}

@test "reports missing directories as failures" {
  run bash -c "cd '$TEMPDIR' && rm -rf services && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"services"* ]]
  [[ "$output" == *"directory missing"* ]]
}

@test "reports clean working tree" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Working tree clean"* ]]
}

@test "warns on uncommitted changes" {
  run bash -c "cd '$TEMPDIR' && echo 'dirty' >> untracked.txt && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Uncommitted changes"* ]]
}

@test "checks platform defaults file" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"defaults"* ]]
}

@test "checks platform schema file" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Platform config loads"* ]]
}

@test "reports missing platform schema as failure" {
  run bash -c "cd '$TEMPDIR' && rm platform/schema.env && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Missing platform/schema.env"* ]]
}

@test "checks services with service.yml" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"example-service"* ]]
  [[ "$output" == *"has service.yml"* ]]
}

@test "warns when service is missing service.yml" {
  mkdir -p "$TEMPDIR/services/bad-service"
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"bad-service"* ]]
  [[ "$output" == *"missing service.yml"* ]]
}

@test "fails when ci directory is missing" {
  run bash -c "cd '$TEMPDIR' && rm -rf ci && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"ci directory missing"* ]]
}

@test "fails when platform directory is missing" {
  run bash -c "cd '$TEMPDIR' && rm -rf platform && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -ne 0 ]
  [[ "$output" == *"platform directory missing"* ]]
}

@test "runs without errors in a minimal valid project" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [ "$status" -eq 0 ]
}

@test "summary shows zero failures for healthy system" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  [[ "$output" == *"Failures: 0"* ]]
  [[ "$output" == *"System is healthy"* ]]
}

@test "handles absent docker gracefully" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../scripts/doctor.sh'"
  # Should not fail; docker is optional
  [ "$status" -eq 0 ]
}
