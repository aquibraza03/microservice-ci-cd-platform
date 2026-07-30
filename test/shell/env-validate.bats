#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export ENV_FILE="$TEMPDIR/test.env"
  export SCHEMA_FILE="$TEMPDIR/schema.env"
  export EXAMPLE_FILE="$TEMPDIR/example.env"
  export OUTPUT_FORMAT="text"
  export STRICT="false"
  unset ENVIRONMENT
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "exits non-zero when env file is missing" {
  export ENV_FILE="$TEMPDIR/nonexistent.env"
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [ "$status" -ne 0 ]
}

@test "exits non-zero when required var is missing in schema" {
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:true:::
EOF
  cat > "$ENV_FILE" <<'EOF'
PORT=8080
EOF
  cat > "$EXAMPLE_FILE" <<'EOF'
PORT=8080
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [ "$status" -ne 0 ]
}

@test "passes when all required vars are set" {
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:true:::
PORT=number:false:::8080
EOF
  cat > "$ENV_FILE" <<'EOF'
DB_HOST=localhost
PORT=8080
EOF
  cat > "$EXAMPLE_FILE" <<'EOF'
DB_HOST=localhost
PORT=8080
EOF
  SCRIPT_PATH="$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  run bash -x "$SCRIPT_PATH" 2>&1
  echo "DEBUG: status=$status" >&3
  [ "$status" -eq 0 ]
}

@test "warns when optional var has invalid number type" {
  cat > "$SCHEMA_FILE" <<'EOF'
PORT=number:false:::8080
EOF
  cat > "$ENV_FILE" <<'EOF'
PORT=notanumber
EOF
  cat > "$EXAMPLE_FILE" <<'EOF'
PORT=8080
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  echo "$output"
  [[ "$output" == *"should be number"* ]]
}

@test "warns when var not in schema" {
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:false:::
EOF
  cat > "$ENV_FILE" <<'EOF'
DB_HOST=localhost
EXTRA_VAR=something
EOF
  cat > "$EXAMPLE_FILE" <<'EOF'
DB_HOST=localhost
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [[ "$output" == *"not in schema"* ]]
}

@test "warns on duplicate keys" {
  cat > "$SCHEMA_FILE" <<'EOF'
PORT=number:false:::8080
EOF
  printf 'PORT=8080\nPORT=9090\n' > "$ENV_FILE"
  cat > "$EXAMPLE_FILE" <<'EOF'
PORT=8080
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [[ "$output" == *"Duplicate key"* ]]
}

@test "warns on invalid port range" {
  cat > "$SCHEMA_FILE" <<'EOF'
SERVICE_PORT=port:false:::3000
EOF
  cat > "$ENV_FILE" <<'EOF'
SERVICE_PORT=99999
EOF
  cat > "$EXAMPLE_FILE" <<'EOF'
SERVICE_PORT=3000
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [[ "$output" == *"out of valid port range"* ]]
}

@test "strict mode treats warnings as failures" {
  export STRICT="true"
  cat > "$SCHEMA_FILE" <<'EOF'
PORT=number:false:::8080
EOF
  cat > "$ENV_FILE" <<'EOF'
PORT=notanumber
EOF
  cat > "$EXAMPLE_FILE" <<'EOF'
PORT=8080
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [ "$status" -ne 0 ]
}

@test "handles empty env file gracefully" {
  cat > "$SCHEMA_FILE" <<'EOF'
PORT=number:false:::8080
EOF
  : > "$ENV_FILE"
  : > "$EXAMPLE_FILE"
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [ "$status" -eq 0 ]
}

@test "handles boolean validation warnings" {
  cat > "$SCHEMA_FILE" <<'EOF'
ENABLED=boolean:false:::true
EOF
  cat > "$ENV_FILE" <<'EOF'
ENABLED=maybe
EOF
  cat > "$EXAMPLE_FILE" <<'EOF'
ENABLED=true
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [[ "$output" == *"should be boolean"* ]]
}

@test "passes with JSON output format" {
  export OUTPUT_FORMAT="json"
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:true:::
EOF
  cat > "$ENV_FILE" <<'EOF'
DB_HOST=localhost
EOF
  cat > "$EXAMPLE_FILE" <<'EOF'
DB_HOST=localhost
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/env-validate.sh"
  [ "$status" -eq 0 ]
}
