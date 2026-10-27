#!/usr/bin/env bats

@test "defaults to success status and default message" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/notify.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Status: success"* ]]
  [[ "$output" == *"Message: No message provided"* ]]
  [[ "$output" == *"Pipeline succeeded"* ]]
}

@test "reports success with a custom message" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/notify.sh" success "build is green"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Pipeline succeeded: build is green"* ]]
}

@test "reports failure on stderr" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/notify.sh" failure "tests failed"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Pipeline failed: tests failed"* ]]
}

@test "handles unknown status values" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/notify.sh" pending "waiting"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Unknown status: pending"* ]]
}

@test "handles empty message argument" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/notify.sh" success ""
  [ "$status" -eq 0 ]
  [[ "$output" == *"Pipeline succeeded:"* ]]
}
