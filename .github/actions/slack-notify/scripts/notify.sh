#!/usr/bin/env bash
set -Eeuo pipefail

# ------------------------------------------------------------------------------
# Slack Notify Script
# Supports:
# - severity levels
# - GitHub metadata
# - retries
# - mentions
# - custom username/icon
# ------------------------------------------------------------------------------

log() {
  echo "[slack-notify] $*"
}

fail() {
  echo "[slack-notify] ERROR: $*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

escape_json() {
  python3 - <<'PY'
import json, os
print(json.dumps(os.environ["RAW"]))
PY
}

# ------------------------------------------------------------------------------
# Required Variables
# ------------------------------------------------------------------------------

: "${WEBHOOK_URL:?WEBHOOK_URL is required}"
: "${MESSAGE:?MESSAGE is required}"

TITLE="${TITLE:-Workflow Notification}"
STATUS="${STATUS:-info}"
USERNAME="${USERNAME:-GitHub Actions}"
ICON_EMOJI="${ICON_EMOJI:-:rocket:}"
MENTION="${MENTION:-}"
FOOTER="${FOOTER:-CI/CD Notification}"
CHANNEL="${CHANNEL:-}"
MAX_RETRIES="${MAX_RETRIES:-3}"

# ------------------------------------------------------------------------------
# Runtime Checks
# ------------------------------------------------------------------------------

require curl
require python3

# ------------------------------------------------------------------------------
# Resolve Color
# ------------------------------------------------------------------------------

case "$STATUS" in
  success) COLOR="good" ;;
  warning) COLOR="warning" ;;
  failure) COLOR="danger" ;;
  *) COLOR="#439FE0" ;;
esac

# ------------------------------------------------------------------------------
# GitHub Context
# ------------------------------------------------------------------------------

REPO="${GITHUB_REPOSITORY:-unknown}"
ACTOR="${GITHUB_ACTOR:-unknown}"
BRANCH="${GITHUB_REF_NAME:-unknown}"
SHA="${GITHUB_SHA:-unknown}"
SHORT_SHA="$(echo "$SHA" | cut -c1-7)"
RUN_ID="${GITHUB_RUN_ID:-0}"
SERVER_URL="${GITHUB_SERVER_URL:-https://github.com}"
RUN_URL="$SERVER_URL/$REPO/actions/runs/$RUN_ID"

# ------------------------------------------------------------------------------
# Safe JSON Strings
# ------------------------------------------------------------------------------

RAW="$TITLE"; TITLE_JSON=$(escape_json)
RAW="$MESSAGE"; MESSAGE_JSON=$(escape_json)
RAW="$USERNAME"; USERNAME_JSON=$(escape_json)
RAW="$ICON_EMOJI"; ICON_JSON=$(escape_json)
RAW="$FOOTER"; FOOTER_JSON=$(escape_json)
RAW="$MENTION"; MENTION_JSON=$(escape_json)

TEXT="${MENTION} ${MESSAGE}"
RAW="$TEXT"; TEXT_JSON=$(escape_json)

# ------------------------------------------------------------------------------
# Build Payload
# ------------------------------------------------------------------------------

cat > payload.json <<EOF
{
  "username": $USERNAME_JSON,
  "icon_emoji": $ICON_JSON,
  "attachments": [
    {
      "color": "$COLOR",
      "title": $TITLE_JSON,
      "title_link": "$RUN_URL",
      "text": $TEXT_JSON,
      "fields": [
        { "title": "Repository", "value": "$REPO", "short": true },
        { "title": "Branch", "value": "$BRANCH", "short": true },
        { "title": "Actor", "value": "$ACTOR", "short": true },
        { "title": "Commit", "value": "$SHORT_SHA", "short": true }
      ],
      "footer": $FOOTER_JSON
    }
  ]
}
EOF

if [ -n "$CHANNEL" ]; then
  python3 - <<PY
import json
with open("payload.json") as f:
    data=json.load(f)
data["channel"]="${CHANNEL}"
with open("payload.json","w") as f:
    json.dump(data,f)
PY
fi

# ------------------------------------------------------------------------------
# Send With Retries
# ------------------------------------------------------------------------------

ATTEMPT=1
SENT=false

while [ "$ATTEMPT" -le "$MAX_RETRIES" ]; do
  log "Sending notification attempt $ATTEMPT/$MAX_RETRIES"

  CODE="$(curl -sS -o response.txt -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    --data @payload.json \
    "$WEBHOOK_URL" || true)"

  if [ "$CODE" = "200" ]; then
    SENT=true
    break
  fi

  ATTEMPT=$((ATTEMPT+1))
  sleep 2
done

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------

if [ "$SENT" = true ]; then
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "sent=true" >> "$GITHUB_OUTPUT"
  fi
else
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "sent=false" >> "$GITHUB_OUTPUT"
  fi
  fail "Failed to send Slack notification"
fi

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Slack Notification Sent"
    echo "- Title: $TITLE"
    echo "- Status: $STATUS"
    echo "- Repository: $REPO"
    echo "- Branch: $BRANCH"
    echo "- Actor: $ACTOR"
    echo "- Sent: $SENT"
  } >> "$GITHUB_STEP_SUMMARY"
fi

log "Notification completed successfully"
