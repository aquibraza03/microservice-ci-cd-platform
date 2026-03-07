#!/usr/bin/env bash
set -e

mkdir -p bin

echo "Installing Syft..."
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b ./bin

echo "Installing Trivy..."
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b ./bin

echo "Setup complete."

# Add bin to PATH for current shell session
export PATH="$PWD/bin:$PATH"

echo "Setup complete."
echo "Tools installed in ./bin and added to PATH for this session."