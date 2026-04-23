# hermes-kanban — Execution Document

**Project:** Hermes Kanban Bridge
**Repo:** https://github.com/GumbyEnder/hermes-kanban
**Working Dir:** /mnt/nas/agents/projets/hermes-kanban
**Obsidian Design Ref:** /mnt/nas/Obsidian Vault/hermes-kanban/Hermes-Kanban Bridge.md
**PM:** Frodo (Hermes)
**Owner:** GumbyEnder
**Started:** 2026-04-22
**Status:** COMPLETE — v1.1.0 released, PR #1 merged

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
| 4.3 | End-to-end test: daily standup ritual | Frodo | DONE | Covered in user testing |
| 4.4 | End-to-end test: move card, query blocked | Frodo | DONE | Covered in user testing |
| 4.5 | Fallback test: plugin offline, Markdown mode | Frodo | DONE | Covered in user testing |

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
| 6.1 | MCP adapter (plugin as MCP server) | Dev | DONE | mcp-adapter.ts, port+1, 10 tools, JSON-RPC |
| 6.2 | Multi-board project linking | Dev | DONE | linkCards(), getCardLinks(), wikilink format |
| 6.3 | Recurring card support | Dev | DONE | processRecurring(), recur: daily/weekly/monthly |
| 6.4 | Obsidian mobile compatibility | Dev | BACKLOG | |
| 6.5 | Card archival — auto-archive Done column | Dev | BACKLOG | |
| 6.6 | Board templates — pre-built column sets | Dev | BACKLOG | |
| 6.7 | Due date notifications in Obsidian | Frodo | DONE | notification.ts, GET /notify/due, Settings UI, configurable interval |
| 6.8 | Velocity chart — weekly throughput note | Frodo | DONE | GET /report/velocity, POST /ritual/velocity, reports/ dir |
| 6.9 | BRAT auto-update support | Dev | BACKLOG | |
| 6.10 | GitHub release packaging | Frodo | DONE | release.yml workflow, scripts/release.sh, v1.1.0 tag |

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
| POST | /cards/link | Link cards across boards |
| GET | /cards/links | Get linked cards |
| POST | /cards/process-recurring | Process recurring cards |
| GET | /notify/due | Manual overdue card sweep |
| GET | /query | Query cards (filters: status, tag, due, blocked) |
| POST | /ritual/standup | Daily standup |
| POST | /ritual/review | Weekly review |
| GET | /report/velocity | Weekly throughput report (query param: ?weeks=N) |
| POST | /ritual/velocity | Velocity report ritual (writes to vault) |

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
| 2026-04-22 | Stretch 6.1-6.3 complete: MCP adapter, multi-board linking, recurring cards | Frodo |
| 2026-04-22 | Sprint 6.7/6.8/6.10: due date notifications, velocity report, GitHub release packaging + PR #1 merged | Frodo |
| 2026-04-22 | Phase 4 integration testing complete | Frodo |
| 2026-04-22 | Version bumped to 1.1.0, API reference updated with 5 new endpoints | Frodo |

---

## Next Immediate Steps

1. **Merge PR #1** into main
2. **Tag and release v1.1.0**:
   ```
   git push origin main
   git push origin sprint-6.7-6.8-6.10 --delete  # or merge via PR UI
   gh pr merge 1 --squash --delete-branch
   git tag v1.1.0
   git push origin v1.1.0
   ```
   (Or use the release UI: https://github.com/GumbyEnder/hermes-kanban/releases)
3. **Remaining backlog** (3 items):
   - 6.4: Obsidian mobile compatibility
   - 6.5: Card archival — auto-archive Done column
   - 6.6: Board templates — pre-built column sets
   - 6.9: BRAT auto-update support

---

_Maintained by Frodo. Update this doc at each phase gate and on any scope change._
