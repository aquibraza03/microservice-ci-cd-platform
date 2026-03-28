#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Setting up platform tools..."

BIN_DIR="${BIN_DIR:-bin}"
TOOLS_FILE="${TOOLS_FILE:-scripts/tools.env}"

mkdir -p "$BIN_DIR"

# Add bin to PATH safely
case ":$PATH:" in
  *":$PWD/$BIN_DIR:"*) ;;
  *) export PATH="$PWD/$BIN_DIR:$PATH" ;;
esac

hash -r

# -------------------------------
# Load tool definitions (NO HARDCODING)
# -------------------------------
if [[ ! -f "$TOOLS_FILE" ]]; then
  echo "⚠️ No tools definition file found ($TOOLS_FILE)"
  exit 0
fi

# -------------------------------
# Safe installer
# -------------------------------
install_tool() {
  local name="$1"
  local url="$2"

  # Skip if already installed
  if command -v "$name" >/dev/null 2>&1 || command -v "$name.exe" >/dev/null 2>&1; then
    echo "✅ $name already installed"
    return
  fi

  echo "📦 Installing $name..."

  # Download and install safely
  if curl -fsSL "$url" | sh -s -- -b "$PWD/$BIN_DIR"; then
    echo "✅ Installed $name"
  else
    echo "❌ Failed to install $name"
    return 1
  fi
}

# -------------------------------
# Read tools dynamically
# -------------------------------
while IFS= read -r line || [[ -n "$line" ]]; do

  # Remove Windows carriage return
  line="$(echo "$line" | tr -d '\r' | xargs)"

  # Skip empty or comment
  [[ -z "$line" || "$line" =~ ^# ]] && continue

  # Ensure valid format
  if [[ "$line" != *=* ]]; then
    echo "⚠️ Skipping invalid entry: $line"
    continue
  fi

  name="${line%%=*}"
  url="${line#*=}"

  name="$(echo "$name" | xargs)"
  url="$(echo "$url" | xargs)"

  # Validate URL
  if [[ -z "$url" ]]; then
    echo "⚠️ Skipping $name (empty URL)"
    continue
  fi

  install_tool "$name" "$url"

done < "$TOOLS_FILE"

# -------------------------------
# Show installed tools
# -------------------------------
echo ""
echo "📦 Installed tools:"

for tool in $(cut -d= -f1 "$TOOLS_FILE"); do
  [[ -z "$tool" || "$tool" =~ ^# ]] && continue

  if command -v "$tool" >/dev/null 2>&1; then
    version="$($tool --version 2>/dev/null | head -n1 || true)"
    echo " - $tool ${version:-installed}"
  fi
done

echo ""
echo "✅ Setup complete"

if command -v trivy >/dev/null 2>&1 || command -v trivy.exe >/dev/null 2>&1; then
  echo " - $(trivy --version 2>/dev/null | head -n1)"
fi
