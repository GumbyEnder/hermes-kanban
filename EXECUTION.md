# hermes-kanban — Execution Document

**Project:** Hermes Kanban Bridge
**Repo:** https://github.com/GumbyEnder/hermes-kanban
**Working Dir:** /mnt/nas/agents/projets/hermes-kanban
**Obsidian Design Ref:** /mnt/nas/Obsidian Vault/hermes-kanban/Hermes-Kanban Bridge.md
**PM:** Frodo (Hermes)
**Owner:** GumbyEnder
**Started:** 2026-04-22
**Status:** ACTIVE — Phase 1 in progress

---

## Vision

Turn Hermes into a true project co-pilot that lives inside your Obsidian workspace.
The result: Hermes can break any goal into a Kanban board, move cards, query state,
and run planning rituals — all from inside Obsidian, fully local, fully private.

---

## Expanded Scope (beyond original spec)

The original plan covered plugin + 2 skills. This execution expands to:

1. Plugin with full REST API (localhost:27124, configurable)
2. 3 Hermes skills (orchestrator, project-breakdown, rituals)
3. CI/CD via GitHub Actions (build + test on push)
4. Automated install script for plugin + skills
5. Obsidian Kanban plugin compatibility (mgmeyers/obsidian-kanban)
6. Optional: MCP adapter so plugin can also serve as an MCP server
7. Developer docs (README, API reference, SKILLS reference)
8. A live demo board in the repo (docs/demo/)

---

## Architecture

```
Hermes Agent
    |
    | HTTP (localhost:27124)
    v
hermes-kanban-bridge plugin (Obsidian)
    |
    | Vault API (obsidian.app.vault)
    v
Obsidian Vault / Markdown Kanban files
    (compatible with mgmeyers/obsidian-kanban plugin)
```

Plugin runs an embedded HTTP server.
All write operations require user confirmation modal (configurable to auto-trust).
Hermes skills call the REST endpoints; fall back to direct Markdown writes if plugin is offline.

---

## Repo Structure (target)

```
hermes-kanban/
  plugin/                     <- Obsidian plugin source
    src/
      main.ts                 <- Plugin entry: settings, server lifecycle
      server.ts               <- Express/Node HTTP server + route handlers
      kanban-parser.ts        <- Read/write mgmeyers Kanban Markdown format
      modal.ts                <- User confirmation modal
      settings.ts             <- Settings tab (port, board folder, trust rules)
    manifest.json
    package.json
    tsconfig.json
    esbuild.config.js
  skills/                     <- Hermes skill Markdown files
    kanban-orchestrator.md
    project-breakdown-to-kanban.md
    kanban-rituals.md
  docs/
    README.md
    API.md
    SKILLS.md
    DEVELOPMENT.md
    demo/
      Q3-Launch.md            <- Example Kanban board
  scripts/
    install.sh                <- One-shot: build plugin, copy to vault, install skills
  .github/
    workflows/
      build.yml               <- Build + lint on push
  EXECUTION.md                <- This file
```

---

## Milestones & Phases

### Phase 0 — Foundation (NOW)
| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 0.1 | Create execution document | Frodo | DONE | This file |
| 0.2 | Create working folder on NAS | Frodo | DONE | /mnt/nas/agents/projets/hermes-kanban |
| 0.3 | Clone/init GitHub repo locally | Dev | DONE | git init + remote set, pushed to main |
| 0.4 | Bootstrap plugin scaffold (obsidianmd template) | Dev | DONE | Manual scaffold (degit unavailable) |
| 0.5 | Set up tsconfig + esbuild pipeline | Dev | DONE | Build passes clean (tsc + esbuild) |
| 0.6 | Create skills/ and docs/ folder structure | Dev | DONE | All folders created |

### Phase 1 — Plugin Core
| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1.1 | Implement settings tab (port, board folder, trust) | Dev | DONE | settings.ts + main.ts SettingTab |
| 1.2 | Implement embedded HTTP server (server.ts) | Dev | DONE | Node http module, all routes |
| 1.3 | GET /boards — list all Kanban boards in vault | Dev | DONE | |
| 1.4 | POST /boards — create new board with custom columns | Dev | DONE | |
| 1.5 | POST /cards — add card to a board/column | Dev | DONE | |
| 1.6 | PUT /cards/:id — update card metadata | Dev | DONE | |
| 1.7 | POST /cards/move — move card between columns | Dev | DONE | |
| 1.8 | GET /query — filter by status, tag, due date | Dev | DONE | |
| 1.9 | User confirmation modal for all write ops | Dev | DONE | modal.ts (ConfirmModal) |
| 1.10 | Kanban Markdown parser (mgmeyers format) | Dev | DONE | kanban-parser.ts |

### Phase 2 — Rituals & Advanced Queries
| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 2.1 | POST /ritual/standup — daily standup summary | Dev | DONE | in kanban-parser.ts |
| 2.2 | POST /ritual/review — weekly review report | Dev | DONE | in kanban-parser.ts |
| 2.3 | GET /query?overdue=true — overdue cards | Dev | DONE | |
| 2.4 | GET /query?blocked=true — blocked cards | Dev | DONE | |
| 2.5 | Card archival support | Dev | BACKLOG | Deferred — low priority |

### Phase 3 — Hermes Skills
| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 3.1 | Finalize kanban-orchestrator.md skill | Frodo | DONE | v2.0 with full endpoint docs |
| 3.2 | Write project-breakdown-to-kanban.md skill | Frodo | DONE | |
| 3.3 | Write kanban-rituals.md skill | Frodo | DONE | |
| 3.4 | Install all 3 skills into Hermes | Frodo | DONE | Installed to ~/.hermes/profiles/frodo/skills/productivity/ |

### Phase 4 — Integration & Testing
| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 4.1 | Build plugin and load in Obsidian (BRAT or folder) | Gumby | DONE | Manual copy via install script |
| 4.2 | End-to-end test: break down a goal into a board | Frodo | DONE | stretch goals board created live |
| 4.3 | End-to-end test: daily standup ritual | Frodo | PENDING | Next session |
| 4.4 | End-to-end test: move card, query blocked | Frodo | PENDING | Next session |
| 4.5 | Fallback test: plugin offline, Markdown mode | Frodo | PENDING | Next session |

### Phase 5 — CI/CD & Docs
| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 5.1 | GitHub Actions: build + lint workflow | Dev | DONE | .github/workflows/build.yml |
| 5.2 | Write README.md | Dev/Frodo | DONE | docs/README.md |
| 5.3 | Write API.md (full endpoint reference) | Dev/Frodo | DONE | docs/API.md (all 11 endpoints) |
| 5.4 | Write SKILLS.md | Frodo | DONE | docs/SKILLS.md |
| 5.5 | Write install.sh script | Dev | DONE | scripts/install.sh |
| 5.6 | Demo board (docs/demo/) | Frodo | DONE | docs/demo/Q3-Launch.md |

### Phase 6 — Optional Stretch Goals
| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 6.1 | MCP adapter (plugin as MCP server) | Dev | BACKLOG | Lets other MCP-aware clients use it |
| 6.2 | Multi-board project linking | Dev | BACKLOG | Cards that reference cards on other boards |
| 6.3 | Recurring card support | Dev | BACKLOG | |
| 6.4 | Obsidian mobile compatibility | Dev | BACKLOG | |

---

## REST API Reference (target spec)

Base URL: `http://localhost:27124` (configurable)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Plugin liveness check |
| GET | /boards | List all boards |
| POST | /boards | Create new board |
| GET | /boards/:id | Get board state |
| POST | /cards | Add card |
| PUT | /cards/:id | Update card |
| DELETE | /cards/:id | Delete card (with confirmation) |
| POST | /cards/move | Move card to column |
| GET | /query | Query cards (filters: status, tag, due, blocked) |
| POST | /ritual/standup | Daily standup |
| POST | /ritual/review | Weekly review |

All write endpoints return `{ ok: true, message: string }` or `{ ok: false, error: string }`.

---

## Risks & Blockers

| Risk | Severity | Mitigation |
|------|----------|------------|
| Obsidian API for HTTP server may be restricted | HIGH | Use Node http module bundled with plugin; test early |
| mgmeyers Kanban format is undocumented | MEDIUM | Parse from existing board files; write tests |
| Hermes skill auto-load timing | LOW | Skills already work in Markdown fallback today |
| Port conflicts on 27124 | LOW | Make port configurable in settings |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-22 | Expand scope to include CI/CD, install script, MCP stretch | Gumby gave full execution authority |
| 2026-04-22 | Use /mnt/nas/agents/projets/hermes-kanban as working dir | NAS preferred for project outputs |
| 2026-04-22 | kanban-orchestrator.md skill exists as draft — reuse + update | Avoid duplicate work |
| 2026-04-22 | Bundle obsidian-kanban (mgmeyers) in install script instead of forking | Less maintenance, respects MIT license |
| 2026-04-22 | Bind server to 0.0.0.0 instead of 127.0.0.1 | Hermes runs on a different machine; Tailscale access required |
| 2026-04-22 | Add kanban-plugin: board frontmatter to all created boards | Required by obsidian-kanban to render visual board |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-22 | Execution document created, Phase 0 tasks scoped | Frodo |
| 2026-04-22 | Phases 0-3 + 5 complete — plugin built, skills installed, CI live | Frodo |
| 2026-04-22 | Fix: bind server to 0.0.0.0 for Tailscale/cross-machine access | Frodo |
| 2026-04-22 | Fix: add kanban-plugin: board frontmatter to all created boards | Frodo |
| 2026-04-22 | Fix: install script updated to bundle obsidian-kanban visual renderer | Frodo |
| 2026-04-22 | Phase 4: plugin live in Obsidian, stretch goals board created end-to-end | Frodo |
| 2026-04-22 | Docs: README rewritten with full troubleshooting section | Frodo |
| 2026-04-22 | Stretch goals backlog active in Obsidian Kanban board | Frodo |

---

## Next Immediate Steps

1. **Phase 4 — Integration Testing** (only remaining phase):
   - Gumby installs plugin in Obsidian (copy plugin/main.js + manifest.json to vault .obsidian/plugins/hermes-kanban-bridge/)
   - Enable plugin in Obsidian settings
   - Verify `GET http://localhost:27124/health` returns ok
   - Ask Hermes to break down a goal into a board (triggers kanban-orchestrator skill)
   - Run daily standup ritual
   - Test card move + blocked query
   - Test fallback: stop plugin, verify Markdown fallback works

2. **Stretch Goal 6.1** (optional): MCP adapter for the plugin

---

_Maintained by Frodo. Update this doc at each phase gate and on any scope change._
