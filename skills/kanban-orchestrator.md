---
name: kanban-orchestrator
description: Orchestrates projects and tasks using live Kanban boards in Obsidian via the hermes-kanban-bridge plugin REST API. Creates boards, manages cards, moves items, queries state, runs daily standups and weekly reviews. Use when the user wants to break down a goal, manage a project, track progress, clear blockers, or run planning rituals. Falls back to direct Markdown writes if the plugin is not available.
version: 2.0.0
category: productivity
metadata:
  hermes:
    tags: [kanban, task-management, project-management, planning, execution]
    capabilities: [http, file]
    requires: [hermes-kanban-bridge plugin OR markdown-fallback]
---

# Kanban Orchestrator

This skill turns Hermes into an autonomous project executor that lives inside Obsidian Kanban boards.

## When to Activate

- User asks to "break down", "plan", "manage", or "execute" a project, goal, launch, or initiative
- User mentions tasks, blockers, progress tracking, priorities, deadlines
- User says "move this to done", "what's blocked", "update the board", "run my standup"
- User wants a daily standup, weekly review, or status snapshot

## Plugin API (Preferred)

Base URL: `http://localhost:27124` (configurable in plugin settings)

### Health check — always do this first

```
GET /health
```

If response is `{ ok: true }`, use the plugin API. Otherwise fall back to Markdown mode.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Plugin liveness check |
| GET | /boards | List all boards |
| GET | /boards/:id | Get board with all cards |
| POST | /boards | Create new board |
| POST | /cards | Add card |
| PUT | /cards/:id | Update card metadata |
| POST | /cards/move | Move card to column |
| GET | /query | Query cards (filters: column, tag, blocked, overdue) |
| POST | /ritual/standup | Daily standup summary |
| POST | /ritual/review | Weekly review report |

### Card ID format

`boardPath::column::cardTitle`

Example: `Kanban/Q3-Launch.md::In Progress::Landing page redesign`

## Core Procedures

### 1. Start any session — check plugin health

```
GET http://localhost:27124/health
```

If ok: proceed with API. If not: use Markdown fallback (see below).

### 2. Break a goal into a Kanban board

1. Clarify goal, scope, success criteria
2. Choose columns (default: Backlog → To Do → In Progress → Review → Done; add Blocked when needed)
3. Decompose into cards with: title, priority, due date, tags, blockers
4. Create board: `POST /boards { title, columns }`
5. Populate cards: `POST /cards` for each

### 3. Daily standup

```
POST /ritual/standup
{ "boardId": "Kanban/MyProject.md" }   // optional: omit for all boards
```

Parse response: show inProgress, blocked, dueSoon, summary. Propose card movements. Confirm before moving.

### 4. Move a card

```
POST /cards/move
{ "cardId": "Kanban/MyProject.md::To Do::Write docs", "toColumn": "In Progress" }
```

### 5. Query blocked or overdue

```
GET /query?blocked=true
GET /query?overdue=true
GET /query?boardId=Kanban%2FMyProject.md&column=In+Progress
```

### 6. Weekly review

```
POST /ritual/review
{ "boardId": "Kanban/MyProject.md" }
```

Parse response: show completed, carry-over, blocked, velocity.

## Safety Rules

- Always show a summary of intended changes before writing
- Never delete cards without explicit confirmation
- In confirm mode (default), plugin shows approval modal — user must approve in Obsidian
- In auto-trust mode, changes apply immediately

## Markdown Fallback (plugin offline)

Store boards in `Kanban/` folder in vault. Format:

```markdown
## Backlog
- [ ] Card title | #high | due:2026-05-01 | @tag

## To Do
- [ ] Another card | #medium

## In Progress
- [ ] Active card | #high | due:2026-04-30 | @eng

## Done
- [x] Completed card
```

Card format: `- [ ] Title | #priority | due:YYYY-MM-DD | @tag | blocked:reason`

In fallback mode: read and write files directly using Hermes file tools.
