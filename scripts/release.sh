#!/bin/bash
# Release helper for hermes-kanban-bridge
# Usage: ./scripts/release.sh [new-version]
#
# With a version argument: updates version in package.json + manifest.json,
# builds the plugin, creates a release ZIP, and creates a git tag.
#
# Without arguments: builds from current versions and creates a tag.

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-}"

if [ -n "$VERSION" ]; then
  echo "📦 Bumping version to $VERSION..."
  # Update package.json
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" plugin/package.json
  # Update manifest.json
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" plugin/manifest.json
fi

VERSION=$(node -p "require('./plugin/package.json').version")

echo "🔨 Building plugin..."
cd plugin && npm ci 2>/dev/null && npm run build
cd ..

echo "📦 Creating release ZIP..."
mkdir -p dist
cd plugin
if [ -f styles.css ]; then
  zip ../dist/hermes-kanban-bridge-${VERSION}.zip main.js manifest.json styles.css
else
  zip ../dist/hermes-kanban-bridge-${VERSION}.zip main.js manifest.json
fi
cd ..

echo "🏷️ Creating git tag v${VERSION}..."
git add plugin/package.json plugin/manifest.json
git commit -m "chore: bump version to ${VERSION}"
git tag -a "v${VERSION}" -m "Release v${VERSION}"

echo ""
echo "✅ Release ZIP created: dist/hermes-kanban-bridge-${VERSION}.zip"
echo "✅ Git tag created: v${VERSION}"
echo ""
echo "📤 Push to trigger GitHub Actions release:"
echo "   git push origin main"
echo "   git push origin v${VERSION}"
