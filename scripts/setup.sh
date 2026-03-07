#!/usr/bin/env bash
set -euo pipefail

mkdir -p bin

# Add ./bin to PATH only if not already present, then refresh hash cache
case ":$PATH:" in
  *":$PWD/bin:"*) ;;
  *) export PATH="$PWD/bin:$PATH" ;;
esac

hash -r

echo "🔧 Setting up platform tools..."

install_if_missing() {
  local tool="$1"
  local url="$2"

  if ! command -v "$tool" >/dev/null 2>&1 && ! command -v "$tool.exe" >/dev/null 2>&1; then
    echo "Installing $tool..."
    curl -sSfL "$url" | sh -s -- -b ./bin || {
      echo "❌ Failed installing $tool"
      exit 1
    }
  else
    echo "$tool already installed"
  fi
}

install_if_missing syft "https://raw.githubusercontent.com/anchore/syft/main/install.sh"
install_if_missing trivy "https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh"

echo ""
echo "✅ Setup complete"
echo "Tools available:"

if command -v syft >/dev/null 2>&1 || command -v syft.exe >/dev/null 2>&1; then
  echo " - $(syft version 2>/dev/null | head -n1)"
fi

if command -v trivy >/dev/null 2>&1 || command -v trivy.exe >/dev/null 2>&1; then
  echo " - $(trivy --version 2>/dev/null | head -n1)"
fi
