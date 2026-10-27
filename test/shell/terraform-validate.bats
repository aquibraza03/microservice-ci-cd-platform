#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/terraform" <<'EOF'
#!/usr/bin/env bash
echo "terraform $*" >> "${TERRAFORM_CALLS:-/dev/null}"
if [[ "$1" == "fmt" ]]; then
  exit 0
fi
if [[ "$1" == "init" ]]; then
  exit "${TERRAFORM_INIT_EXIT:-0}"
fi
if [[ "$1" == "validate" ]]; then
  exit "${TERRAFORM_VALIDATE_EXIT:-0}"
fi
exit 0
EOF
  chmod +x "$FAKE_BIN/terraform"

  export PATH="$FAKE_BIN:$PATH"
  export REPO_ROOT="$TEMPDIR/repo"
  REQUIRED=("main.tf" "providers.tf" "versions.tf" "variables.tf" "outputs.tf" "backend.tf" "terraform.tfvars")
  for ENV in dev staging prod; do
    local dir="$REPO_ROOT/environments/$ENV"
    mkdir -p "$dir"
    for f in "${REQUIRED[@]}"; do
      echo "x" > "$dir/$f"
    done
  done
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "passes when all environments are valid" {
  run bash "$BATS_TEST_DIRNAME/../../ci/terraform-validate.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ALL CHECKS PASSED"* ]]
}

@test "fails when a required file is missing" {
  rm "$REPO_ROOT/environments/dev/backend.tf"
  run bash "$BATS_TEST_DIRNAME/../../ci/terraform-validate.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"SOME CHECKS FAILED"* ]]
  [[ "$output" == *"Missing required file"* ]]
}

@test "fails when an environment directory is missing" {
  rm -rf "$REPO_ROOT/environments/prod"
  run bash "$BATS_TEST_DIRNAME/../../ci/terraform-validate.sh"
  [[ "$output" == *"Environment directory not found"* ]]
}

@test "reports terraform init failure" {
  run bash -c "TERRAFORM_INIT_EXIT=1 bash '$BATS_TEST_DIRNAME/../../ci/terraform-validate.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"SOME CHECKS FAILED"* ]]
  [[ "$output" == *"terraform init (backend=false)"* ]]
}

@test "reports terraform validate failure" {
  run bash -c "TERRAFORM_VALIDATE_EXIT=1 bash '$BATS_TEST_DIRNAME/../../ci/terraform-validate.sh'"
  [[ "$output" == *"SOME CHECKS FAILED"* ]]
}

@test "invokes terraform validate for every environment" {
  export TERRAFORM_CALLS="$TEMPDIR/terraform-calls.txt"
  run bash -c "TERRAFORM_CALLS='$TERRAFORM_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/terraform-validate.sh'"
  [ "$status" -eq 0 ]
  [[ "$(grep -c 'validate' "$TERRAFORM_CALLS")" -ge 3 ]]
}
