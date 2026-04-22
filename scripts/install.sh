#!/usr/bin/env bash
# install.sh — Install hermes-kanban-bridge plugin and/or Hermes skills
# Usage:
#   bash scripts/install.sh /path/to/your/vault        # install plugin + skills
#   bash scripts/install.sh /path/to/vault --skills-only  # skills only
#   bash scripts/install.sh --skills-only               # skills only (no vault needed)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

VAULT_PATH="${1:-}"
SKILLS_ONLY=false

for arg in "$@"; do
  [[ "$arg" == "--skills-only" ]] && SKILLS_ONLY=true
done

# --- Install plugin ---
if [[ "$SKILLS_ONLY" == false ]]; then
  if [[ -z "$VAULT_PATH" || ! -d "$VAULT_PATH" ]]; then
    echo "ERROR: Vault path is required and must exist. Usage: bash install.sh /path/to/vault"
    exit 1
  fi

  PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/hermes-kanban-bridge"
  mkdir -p "$PLUGIN_DIR"

  echo "Building plugin..."
  cd "$REPO_ROOT/plugin"
  npm install --no-bin-links
  npm run build

  echo "Copying plugin files to $PLUGIN_DIR..."
  cp main.js "$PLUGIN_DIR/"
  cp manifest.json "$PLUGIN_DIR/"

  echo "Plugin installed at $PLUGIN_DIR"
  echo "Reload Obsidian and enable 'Hermes Kanban Bridge' in Community Plugins."
fi

# --- Install skills ---
HERMES_SKILLS_DIR="${HERMES_SKILLS_DIR:-$HOME/.hermes/profiles/frodo/skills}"

if [[ -d "$HERMES_SKILLS_DIR" ]]; then
  echo "Installing Hermes skills to $HERMES_SKILLS_DIR..."
  mkdir -p "$HERMES_SKILLS_DIR/productivity"
  for skill in "$REPO_ROOT/skills/"*.md; do
    cp "$skill" "$HERMES_SKILLS_DIR/productivity/"
    echo "  Installed: $(basename "$skill")"
  done
  echo "Skills installed. Restart Hermes to pick them up."
else
  echo "WARN: Hermes skills dir not found at $HERMES_SKILLS_DIR. Skipping skill install."
  echo "Manually copy files from skills/ to your Hermes skills directory."
fi

echo ""
echo "Done!"
