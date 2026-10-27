#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export BIN_DIR="$TEMPDIR/bin"
  export TOOLS_FILE="$TEMPDIR/tools.env"
  export PATH="$TEMPDIR/fake-bin:$PATH"
  mkdir -p "$BIN_DIR" "$TEMPDIR/fake-bin"

  cat > "$TEMPDIR/fake-bin/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "$TEMPDIR/fake-bin/curl"

  cat > "$TEMPDIR/fake-bin/yq" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then echo "yq version v4.40.5"; exit 0; fi
exit 0
EOF
  chmod +x "$TEMPDIR/fake-bin/yq"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "exits 0 when tools definition file is missing" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/setup.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No tools definition file found"* ]]
}

@test "skips already-installed tools" {
  cat > "$TOOLS_FILE" <<'EOF'
yq=https://example.com/install.sh
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/setup.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"yq already installed"* ]]
  [[ "$output" == *"Setup complete"* ]]
}

@test "installs a tool that is not present" {
  cat > "$TOOLS_FILE" <<'EOF'
newtool=https://example.com/install.sh
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/setup.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Installing newtool"* ]]
  [[ "$output" == *"Installed newtool"* ]]
}

@test "skips invalid entries and empty URLs" {
  cat > "$TOOLS_FILE" <<'EOF'
# a comment

invalid-line-no-equals
emptytool=
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/setup.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Skipping invalid entry"* ]]
  [[ "$output" == *"Skipping emptytool (empty URL)"* ]]
}

@test "tolerates Windows CRLF in tools file" {
  printf 'yq=https://example.com/install.sh\r\n' > "$TOOLS_FILE"
  run bash "$BATS_TEST_DIRNAME/../../scripts/setup.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"yq already installed"* ]]
}

@test "creates BIN_DIR when it does not exist" {
  rm -rf "$BIN_DIR"
  echo "yq=https://example.com/install.sh" > "$TOOLS_FILE"
  run bash "$BATS_TEST_DIRNAME/../../scripts/setup.sh"
  [ "$status" -eq 0 ]
  [ -d "$BIN_DIR" ]
}
