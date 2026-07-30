#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export ORIGINAL_PATH="$PATH"
}

teardown() {
  rm -rf "$TEMPDIR"
  export PATH="$ORIGINAL_PATH"
}

@test "fails when AWS CLI is not installed" {
  local safe_dir="$TEMPDIR/noaws_bin"
  mkdir -p "$safe_dir"
  export PATH="$safe_dir"
  run bash "$BATS_TEST_DIRNAME/../../scripts/aws-auth-check.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"AWS CLI not installed"* ]]
}

@test "detects env var auth method" {
  local mock_dir="$TEMPDIR/mock_env_auth"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/aws" <<'SCRIPT'
#!/usr/bin/env bash
if [ "$1" = "sts" ] && [ "$2" = "get-caller-identity" ]; then
  cat <<'JSON'
{
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/test-user",
  "UserId": "ABCDEF123456"
}
JSON
fi
SCRIPT
  chmod +x "$mock_dir/aws"
  export PATH="$mock_dir"
  export AWS_ACCESS_KEY_ID="AKIA-test"
  export AWS_SECRET_ACCESS_KEY="test-secret"

  run bash "$BATS_TEST_DIRNAME/../../scripts/aws-auth-check.sh"
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"env"* ]]
  [[ "$output" == *"IAM User"* ]]
}

@test "detects OIDC auth method" {
  local mock_dir="$TEMPDIR/mock_oidc"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/aws" <<'SCRIPT'
#!/usr/bin/env bash
if [ "$1" = "sts" ] && [ "$2" = "get-caller-identity" ]; then
  cat <<'JSON'
{
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:role/oidc-role",
  "UserId": "ABCDEF123456"
}
JSON
fi
SCRIPT
  chmod +x "$mock_dir/aws"
  export PATH="$mock_dir"
  export AWS_WEB_IDENTITY_TOKEN_FILE="/tmp/token"

  run bash "$BATS_TEST_DIRNAME/../../scripts/aws-auth-check.sh"
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"oidc"* ]]
  [[ "$output" == *"IAM Role"* ]]
}

@test "fails when AWS identity cannot be retrieved" {
  local mock_dir="$TEMPDIR/mock_fail"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/aws" <<'SCRIPT'
#!/usr/bin/env bash
if [ "$1" = "sts" ] && [ "$2" = "get-caller-identity" ]; then
  exit 1
fi
SCRIPT
  chmod +x "$mock_dir/aws"
  export PATH="$mock_dir"

  run bash "$BATS_TEST_DIRNAME/../../scripts/aws-auth-check.sh"
  echo "$output"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Unable to authenticate"* ]]
}

@test "warns when region is not set" {
  local mock_dir="$TEMPDIR/mock_noregion"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/aws" <<'SCRIPT'
#!/usr/bin/env bash
if [ "$1" = "sts" ] && [ "$2" = "get-caller-identity" ]; then
  cat <<'JSON'
{
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/test-user",
  "UserId": "ABCDEF123456"
}
JSON
fi
SCRIPT
  chmod +x "$mock_dir/aws"
  export PATH="$mock_dir"
  export AWS_ACCESS_KEY_ID="AKIA-test"
  export AWS_SECRET_ACCESS_KEY="test-secret"
  unset AWS_REGION
  unset AWS_DEFAULT_REGION

  run bash "$BATS_TEST_DIRNAME/../../scripts/aws-auth-check.sh"
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"AWS region not set"* ]]
}

@test "prints region when set via AWS_REGION" {
  local mock_dir="$TEMPDIR/mock_region"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/aws" <<'SCRIPT'
#!/usr/bin/env bash
if [ "$1" = "sts" ] && [ "$2" = "get-caller-identity" ]; then
  cat <<'JSON'
{
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/test-user",
  "UserId": "ABCDEF123456"
}
JSON
fi
SCRIPT
  chmod +x "$mock_dir/aws"
  export PATH="$mock_dir"
  export AWS_ACCESS_KEY_ID="AKIA-test"
  export AWS_SECRET_ACCESS_KEY="test-secret"
  export AWS_REGION="us-west-2"

  run bash "$BATS_TEST_DIRNAME/../../scripts/aws-auth-check.sh"
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"us-west-2"* ]]
}

@test "uses fallback parser when jq is not available" {
  local mock_dir="$TEMPDIR/mock_fallback"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/aws" <<'SCRIPT'
#!/usr/bin/env bash
if [ "$1" = "sts" ] && [ "$2" = "get-caller-identity" ]; then
  cat <<'JSON'
{
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/test-user",
  "UserId": "ABCDEF123456"
}
JSON
fi
SCRIPT
  chmod +x "$mock_dir/aws"
  export PATH="$mock_dir"
  export AWS_ACCESS_KEY_ID="AKIA-test"
  export AWS_SECRET_ACCESS_KEY="test-secret"

  run bash "$BATS_TEST_DIRNAME/../../scripts/aws-auth-check.sh"
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"fallback parser"* ]]
}

@test "detects CI environment" {
  local mock_dir="$TEMPDIR/mock_ci"
  mkdir -p "$mock_dir"
  cat > "$mock_dir/aws" <<'SCRIPT'
#!/usr/bin/env bash
if [ "$1" = "sts" ] && [ "$2" = "get-caller-identity" ]; then
  cat <<'JSON'
{
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/test-user",
  "UserId": "ABCDEF123456"
}
JSON
fi
SCRIPT
  chmod +x "$mock_dir/aws"
  export PATH="$mock_dir"
  export AWS_ACCESS_KEY_ID="AKIA-test"
  export AWS_SECRET_ACCESS_KEY="test-secret"
  export CI="true"

  run bash "$BATS_TEST_DIRNAME/../../scripts/aws-auth-check.sh"
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"CI environment"* ]]
}
