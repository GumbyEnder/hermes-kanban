# Hermes Kanban Bridge

Turn Hermes into a true project co-pilot that lives inside your Obsidian workspace.

## What It Does

- Hermes can break any goal into a structured Kanban board inside Obsidian
- Move cards between columns, update metadata, query state in real time
- Run daily standups and weekly review rituals automatically
- Fully local, fully private — no cloud dependencies

## Architecture

```
Hermes Agent
    |
    | HTTP (localhost:27124)
    v
hermes-kanban-bridge plugin (Obsidian)
    |
    | Vault API
    v
Obsidian Markdown Kanban boards
```

## Installation

### Plugin (Manual)

1. Build the plugin: `cd plugin && npm install && npm run build`
2. Copy `plugin/main.js` and `plugin/manifest.json` to your vault's `.obsidian/plugins/hermes-kanban-bridge/`
3. Reload Obsidian → Settings → Community Plugins → Enable "Hermes Kanban Bridge"

### Plugin (BRAT)

1. Install the BRAT plugin from Obsidian Community Plugins
2. In BRAT settings, add `GumbyEnder/hermes-kanban`
3. Install and enable

### Install Script (Automated)

```bash
bash scripts/install.sh /path/to/your/vault
```

### Hermes Skills

```bash
bash scripts/install.sh --skills-only
```

Or manually copy files from `skills/` to your Hermes skills directory.

## Usage

Once the plugin is running, Hermes can use these endpoints (see docs/API.md for full reference):

```
GET  http://localhost:27124/health          # Check plugin is running
GET  http://localhost:27124/boards          # List all Kanban boards
POST http://localhost:27124/boards          # Create a new board
POST http://localhost:27124/cards           # Add a card
POST http://localhost:27124/cards/move      # Move a card between columns
GET  http://localhost:27124/query           # Query cards with filters
POST http://localhost:27124/ritual/standup  # Generate daily standup
POST http://localhost:27124/ritual/review   # Generate weekly review
```

## Demo

See `docs/demo/Q3-Launch.md` for an example Kanban board.

## Configuration

Plugin settings (Obsidian Settings → Hermes Kanban Bridge):

- **Port**: Default 27124. Change if there's a conflict.
- **Board folder**: Vault folder to store boards (default: `Kanban`)
- **Trust mode**: `confirm` (show approval modal) or `auto` (no prompts)
- **Enable server**: Toggle the REST API on/off

## Requirements

- Obsidian 1.4.0+
- Desktop only (uses Node.js http module)

## License

MIT
