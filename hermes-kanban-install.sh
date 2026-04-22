#!/usr/bin/env bash
# hermes-kanban-install.sh
# Installs hermes-kanban-bridge + mgmeyers/obsidian-kanban (visual renderer) into your Obsidian vault.
# Usage: bash hermes-kanban-install.sh

set -euo pipefail

VAULT="/mnt/nas/Obsidian Vault"
HKB_PLUGIN_DIR="$VAULT/.obsidian/plugins/hermes-kanban-bridge"
KANBAN_PLUGIN_DIR="$VAULT/.obsidian/plugins/obsidian-kanban"
BUILD_SRC="/tmp/hkb-plugin"
MANIFEST_SRC="/mnt/nas/agents/projets/hermes-kanban/plugin/manifest.json"

echo "==> hermes-kanban installer"
echo ""

# Check vault exists
if [ ! -d "$VAULT" ]; then
  echo "ERROR: Vault not found at: $VAULT"
  exit 1
fi

# ── 1. Build hermes-kanban-bridge ────────────────────────────────────────────

if [ ! -f "$BUILD_SRC/main.js" ]; then
  echo "--> Building hermes-kanban-bridge..."
  rm -rf "$BUILD_SRC"
  cp -r "/mnt/nas/agents/projets/hermes-kanban/plugin" "$BUILD_SRC"
  cd "$BUILD_SRC"
  npm install --no-bin-links --silent
  npm run build
  echo "    Build OK"
  cd - > /dev/null
else
  echo "--> Using existing build at $BUILD_SRC/main.js"
fi

mkdir -p "$HKB_PLUGIN_DIR"
cp "$BUILD_SRC/main.js" "$HKB_PLUGIN_DIR/main.js"
cp "$MANIFEST_SRC" "$HKB_PLUGIN_DIR/manifest.json"
echo "--> hermes-kanban-bridge installed"

# ── 2. Install mgmeyers/obsidian-kanban (visual renderer) ────────────────────

echo "--> Fetching latest obsidian-kanban release..."
KANBAN_RELEASE=$(curl -s -H "Authorization: token $(gh auth token 2>/dev/null || echo '')" \
  https://api.github.com/repos/obsidian-community/obsidian-kanban/releases/latest)
KANBAN_TAG=$(echo "$KANBAN_RELEASE" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null || echo "2.0.51")
echo "    obsidian-kanban version: $KANBAN_TAG"

mkdir -p "$KANBAN_PLUGIN_DIR"

for FILE in main.js manifest.json styles.css; do
  URL="https://github.com/obsidian-community/obsidian-kanban/releases/download/${KANBAN_TAG}/${FILE}"
  echo "    Downloading $FILE ($KANBAN_TAG)..."
  curl -sL "$URL" -o "$KANBAN_PLUGIN_DIR/$FILE"
done

echo "--> obsidian-kanban $KANBAN_TAG installed"

# ── 3. Enable both plugins in community-plugins.json ────────────────────────

COMMUNITY_JSON="$VAULT/.obsidian/community-plugins.json"

if [ ! -f "$COMMUNITY_JSON" ]; then
  echo '[]' > "$COMMUNITY_JSON"
fi

python3 - <<'PYEOF'
import json, os

path = os.environ.get("COMMUNITY_JSON", "/mnt/nas/Obsidian Vault/.obsidian/community-plugins.json")
with open(path) as f:
    plugins = json.load(f)

for pid in ["hermes-kanban-bridge", "obsidian-kanban"]:
    if pid not in plugins:
        plugins.append(pid)

with open(path, "w") as f:
    json.dump(plugins, f, indent=2)

print(f"    community-plugins.json updated: {plugins}")
PYEOF

export COMMUNITY_JSON
python3 - <<'PYEOF'
import json, os

path = os.environ["COMMUNITY_JSON"]
with open(path) as f:
    plugins = json.load(f)

for pid in ["hermes-kanban-bridge", "obsidian-kanban"]:
    if pid not in plugins:
        plugins.append(pid)

with open(path, "w") as f:
    json.dump(plugins, f, indent=2)

print(f"    community-plugins.json: {plugins}")
PYEOF

echo ""
echo "Done! Both plugins installed:"
echo "  $HKB_PLUGIN_DIR"
echo "  $KANBAN_PLUGIN_DIR"
echo ""
echo "Next steps:"
echo "  1. In Obsidian: Settings -> Community Plugins -> toggle safe mode OFF (if needed)"
echo "  2. Enable 'Hermes Kanban Bridge' and 'Kanban' (by mgmeyers)"
echo "  3. Verify: curl http://100.109.144.124:27124/health"
echo "  4. Tell Hermes to create a board — it will appear visually in Obsidian"
