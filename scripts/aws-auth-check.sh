#!/usr/bin/env bash
set -euo pipefail

echo "🔐 Checking AWS authentication..."

# -------------------------------
# Check AWS CLI
# -------------------------------
if ! command -v aws >/dev/null 2>&1; then
  echo "❌ AWS CLI not installed"
  exit 1
fi

# -------------------------------
# Detect auth method (dynamic)
# -------------------------------
AUTH_METHOD="unknown"

if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
  AUTH_METHOD="env"
elif [[ -n "${AWS_WEB_IDENTITY_TOKEN_FILE:-}" ]]; then
  AUTH_METHOD="oidc"
elif [[ -f "${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}" ]]; then
  AUTH_METHOD="profile"
fi

echo "🔍 Detected auth method: $AUTH_METHOD"

# -------------------------------
# Get AWS identity
# -------------------------------
IDENTITY_JSON="$(aws sts get-caller-identity 2>/dev/null || true)"

if [[ -z "$IDENTITY_JSON" ]]; then
  echo "❌ Unable to authenticate with AWS"
  exit 1
fi

# -------------------------------
# Extract identity safely
# -------------------------------

extract_field_fallback() {
  local field="$1"
  echo "$IDENTITY_JSON" \
    | grep -o "\"$field\":[^,}]*" \
    | cut -d':' -f2- \
    | tr -d '" ' \
    || true
}

if command -v jq >/dev/null 2>&1; then

  ACCOUNT_ID="$(jq -r '.Account // empty' <<< "$IDENTITY_JSON")"
  ARN="$(jq -r '.Arn // empty' <<< "$IDENTITY_JSON")"
  USER_ID="$(jq -r '.UserId // empty' <<< "$IDENTITY_JSON")"

else

  echo "⚠️ jq not found — using fallback parser"

  ACCOUNT_ID="$(extract_field_fallback "Account")"
  ARN="$(extract_field_fallback "Arn")"
  USER_ID="$(extract_field_fallback "UserId")"

fi

# -------------------------------
# Final safety defaults
# -------------------------------
ACCOUNT_ID="${ACCOUNT_ID:-unknown}"
ARN="${ARN:-unknown}"
USER_ID="${USER_ID:-unknown}"

# -------------------------------
# Print identity
# -------------------------------
echo "✅ AWS authentication successful"
echo "👤 Identity: $ARN"
echo "🏢 Account: $ACCOUNT_ID"
echo "🆔 User ID: $USER_ID"

# -------------------------------
# Region check (no hardcoding)
# -------------------------------
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"

if [[ -z "$REGION" ]]; then
  echo "⚠️ AWS region not set"
else
  echo "🌍 Region: $REGION"
fi

# -------------------------------
# Basic permission check (STS)
# -------------------------------
echo "🧪 Performing STS check..."

if aws sts get-caller-identity >/dev/null 2>&1; then
  echo "✅ STS access OK"
else
  echo "⚠️ STS check failed"
fi

# -------------------------------
# Optional: detect identity type
# -------------------------------
if [[ "$ARN" == *":user/"* ]]; then
  echo "🔎 Identity type: IAM User"
elif [[ "$ARN" == *":role/"* ]]; then
  echo "🔎 Identity type: IAM Role"
else
  echo "🔎 Identity type: Unknown"
fi

# -------------------------------
# Optional: environment awareness
# -------------------------------
if [[ -n "${CI:-}" ]]; then
  echo "🤖 Running inside CI environment"
fi

echo "🏁 AWS check complete"
