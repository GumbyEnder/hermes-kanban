# Hermes Kanban Bridge — Development Guide

---

## Prerequisites

- Node.js 20+
- npm 10+
- Obsidian desktop (for live testing)

---

## Project layout

    hermes-kanban/
      plugin/         Obsidian plugin (TypeScript + esbuild)
        src/
          main.ts     Plugin entry, settings tab, command registration
          server.ts   Embedded HTTP server, all route handlers
          kanban-parser.ts  Markdown board read/write engine
          modal.ts    User confirmation modal
          settings.ts Settings interface and defaults
        manifest.json
        package.json
        tsconfig.json
        esbuild.config.mjs
      skills/         Hermes skill Markdown files
      docs/           Documentation and demo boards
      scripts/        install.sh helper
      .github/        CI/CD workflows

---

## Build

    cd plugin
    npm install
    npm run build       # production bundle -> plugin/main.js
    npm run dev         # watch mode with inline sourcemaps

---

## Load in Obsidian for testing

Option 1: symlink (Linux/Mac)

    ln -s /path/to/hermes-kanban/plugin \
          /path/to/vault/.obsidian/plugins/hermes-kanban-bridge

Option 2: copy after each build

    cp plugin/main.js plugin/manifest.json \
       /path/to/vault/.obsidian/plugins/hermes-kanban-bridge/

Option 3: use the install script

    bash scripts/install.sh

After loading, enable the plugin in Obsidian settings and check the console
for: "Hermes Kanban Bridge loaded" and "listening on port 27124".

---

## Testing the API

    # Health
    curl http://localhost:27124/health

    # List boards
    curl http://localhost:27124/boards

    # Create board
    curl -X POST http://localhost:27124/boards \
      -H "Content-Type: application/json" \
      -d '{"title":"Test Board","columns":["Todo","Done"]}'

    # Add card
    curl -X POST http://localhost:27124/cards \
      -H "Content-Type: application/json" \
      -d '{"boardId":"Kanban/Test Board.md","column":"Todo","title":"First task","priority":"high"}'

    # Move card
    curl -X POST http://localhost:27124/cards/move \
      -H "Content-Type: application/json" \
      -d '{"cardId":"Kanban/Test Board.md::Todo::First task","toColumn":"Done"}'

---

## Card format

Cards are stored as standard Markdown checklist items with pipe-delimited metadata:

    - [ ] Card title | #priority | due:YYYY-MM-DD | @tag1 @tag2 | blocked:reason

Examples:
    - [ ] Write tests | #high | due:2026-05-01 | @eng
    - [ ] Deploy to staging | #medium | @eng @devops
    - [ ] Fix login bug | #high | blocked:waiting for API keys
    - [x] Completed task

The format is compatible with mgmeyers/obsidian-kanban plugin.

---

## Adding a new endpoint

1. Add the route handler in server.ts inside the route() method
2. Add the business logic method in kanban-parser.ts
3. Update docs/API.md with request/response docs
4. Add a curl example to this file

---

## Architecture decisions

HTTP server: Node's built-in http module, bundled by esbuild into main.js.
No express or other runtime deps to keep the bundle lean.

Card IDs: boardId::column::title composite key. Simple, human-readable,
no UUID dependency. Collision unlikely in practice.

Markdown format: we parse ## headings as columns and - [ ] / - [x] as cards.
This is the same format used by mgmeyers/obsidian-kanban so boards are
interoperable with that plugin.

Trust mode: all write operations can be gated behind a confirm modal.
Auto-trust mode skips the modal for unattended operation.

---

## CI/CD

GitHub Actions workflow at .github/workflows/build.yml runs on every push to main:
1. npm ci
2. tsc --noEmit (type check)
3. npm run build (esbuild bundle)

Artifacts: main.js is not committed to git (in .gitignore). Download from
GitHub Actions artifacts or build locally.

---

## Release process

1. Bump version in plugin/manifest.json and plugin/package.json
2. Run npm run build in plugin/
3. Create GitHub release, attach main.js and manifest.json
4. BRAT users get auto-update notification
