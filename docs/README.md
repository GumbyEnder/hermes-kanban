# Hermes Kanban Bridge

Turn Hermes into a true project co-pilot that lives inside your Obsidian workspace. Hermes can break any goal into a structured Kanban board, move cards, query state, and run daily standups and weekly reviews — all from inside Obsidian, fully local, fully private.

## What It Does

- Break any goal into a structured Kanban board with a single prompt
- Move cards between columns, update metadata, query state in real time
- Run daily standups and weekly review rituals automatically
- Fully local, fully private — no cloud dependencies
- Visual board rendering via the obsidian-kanban plugin

## Architecture

```
Hermes Agent (any machine)
    |
    | HTTP REST API
    v
hermes-kanban-bridge plugin (runs inside Obsidian)
    |
    | Obsidian Vault API
    v
Kanban Markdown files in your vault
    |
    | Renders as visual board
    v
obsidian-kanban plugin (mgmeyers/obsidian-community)
```

## Requirements

- Obsidian 1.4.0+ (desktop only — uses Node.js http module)
- Node.js 18+ (for building the plugin)
- obsidian-kanban plugin (installed automatically by install script)
- Hermes agent with skill support

---

## Installation

### Automated (recommended)

Edit `hermes-kanban-install.sh` to set your vault path, then run:

```bash
bash hermes-kanban-install.sh
```

This installs both plugins (hermes-kanban-bridge + obsidian-kanban visual renderer) and registers them in your vault's community-plugins.json.

### Manual

**Step 1 — Build the plugin:**
```bash
cd plugin
npm install
npm run build
```

**Step 2 — Copy to vault:**
```bash
VAULT="/path/to/your/vault"
mkdir -p "$VAULT/.obsidian/plugins/hermes-kanban-bridge"
cp main.js manifest.json "$VAULT/.obsidian/plugins/hermes-kanban-bridge/"
```

**Step 3 — Install obsidian-kanban (visual renderer):**
```bash
KANBAN_DIR="$VAULT/.obsidian/plugins/obsidian-kanban"
mkdir -p "$KANBAN_DIR"
TAG="2.0.51"  # or check https://github.com/obsidian-community/obsidian-kanban/releases
for f in main.js manifest.json styles.css; do
  curl -sL "https://github.com/obsidian-community/obsidian-kanban/releases/download/$TAG/$f" -o "$KANBAN_DIR/$f"
done
```

**Step 4 — Enable in Obsidian:**
1. Reload Obsidian
2. Settings → Community Plugins → turn off Safe Mode (if on)
3. Enable **Hermes Kanban Bridge** and **Kanban** (by mgmeyers)
4. You should see a notice: "Hermes Kanban Bridge started on port 27124"

**Step 5 — Install Hermes skills:**
```bash
mkdir -p ~/.hermes/profiles/frodo/skills/productivity
cp skills/*.md ~/.hermes/profiles/frodo/skills/productivity/
```

---

## Configuration

Plugin settings (Obsidian → Settings → Hermes Kanban Bridge):

| Setting | Default | Description |
|---------|---------|-------------|
| Port | 27124 | Local port for the REST API |
| Board folder | Kanban | Vault folder where boards are stored |
| Trust mode | confirm | `confirm` = approval modal, `auto` = no prompts |
| Enable server | on | Toggle REST API on/off |

---

## Verify It's Working

```bash
curl http://localhost:27124/health
# {"ok":true,"status":"running","port":27124,"version":"1.0.0"}
```

---

## Usage

Once the plugin is running, tell Hermes:

- "Break down [project] into a Kanban board"
- "Run my daily standup"
- "What's blocked?"
- "Move [card] to In Progress"
- "Give me a weekly review"

Hermes uses the skills in `skills/` to orchestrate everything via the REST API. See `docs/API.md` for the full endpoint reference.

---

## Troubleshooting

### curl: Failed to connect / connection refused

The plugin server starts when Obsidian loads with the plugin enabled. Check:

1. Plugin is enabled: Settings → Community Plugins → Hermes Kanban Bridge is toggled ON
2. You should have seen a notice "Hermes Kanban Bridge started on port 27124" when enabling
3. Try toggling the plugin off and back on to restart the server
4. Check the port isn't in use: `netstat -ano | findstr 27124` (Windows) or `lsof -i :27124` (Mac/Linux)

### Hermes is on a different machine than Obsidian

By default the server binds to `0.0.0.0` (all interfaces). If Hermes and Obsidian are on different machines:

1. Use the Obsidian machine's **Tailscale IP** (or LAN IP) instead of `localhost`
2. **Windows**: Add a firewall rule to allow inbound on port 27124:
   ```powershell
   netsh advfirewall firewall add rule name="Hermes Kanban Bridge" dir=in action=allow protocol=TCP localport=27124
   ```
3. **macOS**: System Settings → Network → Firewall → allow Obsidian
4. Verify the server is listening on all interfaces, not just loopback:
   ```powershell
   netstat -ano | findstr 27124
   # Should show: TCP  0.0.0.0:27124  ... LISTENING
   # NOT:         TCP  127.0.0.1:27124 ... LISTENING
   ```
   If you see 127.0.0.1, toggle the plugin off/on to reload the new build.

### Board opens as a Markdown list, not a visual board

The obsidian-kanban plugin requires a YAML frontmatter trigger at the top of the file:

```markdown
---
kanban-plugin: board
---
```

All boards created via the API include this automatically. If you created a board before this fix:
- Open the file in Obsidian source mode
- Add the frontmatter block at the very top
- Close and reopen the note — it will render as a board

### Plugin not showing in Community Plugins list

Obsidian sometimes needs a full restart (not just reload) to detect a newly copied plugin folder. Quit Obsidian completely and reopen it, then check Settings → Community Plugins.

### Port conflict

If port 27124 is already in use, change it in Settings → Hermes Kanban Bridge → Port. Restart the plugin after changing. Update any Hermes skill configs that reference the port.

---

## Demo

See `docs/demo/Q3-Launch.md` for a sample Kanban board you can drop into your vault's `Kanban/` folder.

---

## License

MIT — see LICENSE file.
