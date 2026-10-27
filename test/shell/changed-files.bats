#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export REPO="$TEMPDIR/repo"
  git init -q "$REPO"
  git -C "$REPO" config user.email "test@example.com"
  git -C "$REPO" config user.name "test"
  echo "a" > "$REPO/a.txt"
  git -C "$REPO" add .
  git -C "$REPO" commit -qm "commit a"
  echo "b" > "$REPO/b.txt"
  git -C "$REPO" add .
  git -C "$REPO" commit -qm "commit b"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "lists files changed between refs" {
  run bash -c "cd '$REPO' && BASE_REF=HEAD~1 HEAD_REF=HEAD bash '$BATS_TEST_DIRNAME/../../ci/changed-files.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"b.txt"* ]]
  [[ "$output" != *"a.txt"* ]]
}

@test "reports no files changed when refs are identical" {
  run bash -c "cd '$REPO' && BASE_REF=HEAD HEAD_REF=HEAD bash '$BATS_TEST_DIRNAME/../../ci/changed-files.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No files changed"* ]]
}

@test "fails when not inside a git repository" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../ci/changed-files.sh'"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Not a git repository"* ]]
}

@test "falls back to first commit when base ref is missing" {
  run bash -c "cd '$REPO' && BASE_REF=nonexistent-ref HEAD_REF=HEAD bash '$BATS_TEST_DIRNAME/../../ci/changed-files.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"b.txt"* ]]
}

@test "uses default refs when none provided" {
  run bash -c "cd '$REPO' && bash '$BATS_TEST_DIRNAME/../../ci/changed-files.sh'"
  [ "$status" -eq 0 ]
}
