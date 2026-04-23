# Hermes Kanban Bridge — REST API Reference

**Version:** 1.2.0
Base URL: `http://localhost:27124` (port configurable in plugin settings)

All responses are JSON. Write operations return `{ ok: true, ... }` or `{ ok: false, error: "..." }`.

---

## GET /health
Check if the plugin server is running.

```json
{ "ok": true, "status": "running", "port": 27124, "version": "1.2.0" }
```

---

## GET /boards
List all Kanban boards in the configured board folder.

```json
{ "ok": true, "boards": [{ "id": "Kanban/Q3-Launch.md", "title": "Q3-Launch", "path": "Kanban/Q3-Launch.md", "cardCount": 12 }] }
```

---

## GET /boards/:id
Get full board state including all columns and cards. `:id` is URL-encoded board path.

```json
{
  "ok": true,
  "board": {
    "id": "Kanban/Q3-Launch.md",
    "title": "Q3-Launch",
    "path": "Kanban/Q3-Launch.md",
    "columns": ["Backlog", "To Do", "In Progress", "Review", "Done"],
    "cards": [{ "id": "...", "title": "...", "column": "...", "boardId": "...", "checked": false }]
  }
}
```

---

## POST /boards
Create a new Kanban board with default or custom columns.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Board name (becomes filename) |
| `columns` | string[] | No | Custom column names (default: Backlog → To Do → In Progress → Review → Done) |
| `template` | string | No | Use a pre-built template (see [Templates](#board-templates)) |
| `boardFolder` | string | No | Override default board folder |

```json
{ "title": "My Project", "columns": ["Backlog", "In Progress", "Done"] }
```

Or with a template:
```json
{ "title": "Sprint 12", "template": "sprint" }
```

---

## POST /cards
Add a card to a board column.

| Field | Type | Required |
|-------|------|----------|
| `boardId` | string | Yes | Board path (e.g. `Kanban/Q3-Launch.md`) |
| `column` | string | Yes | Target column name |
| `title` | string | Yes | Card title |
| `priority` | string | No | `high`, `medium`, `low` |
| `dueDate` | string | No | `YYYY-MM-DD` |
| `tags` | string[] | No | Array of tag names (rendered as `@tag`) |
| `blocked` | boolean | No | Set to `true` |
| `blockerReason` | string | No | Reason for block (requires `blocked: true`) |
| `recur` | string | No | `daily`, `weekly`, `monthly`, or `YYYY-MM-DD` |

---

## PUT /cards/:id
Update card metadata. `:id` = `boardPath::column::title` (URL-encoded).

```json
{ "priority": "medium", "dueDate": "2026-07-01", "tags": ["docs"] }
```

---

## POST /cards/move
Move a card to a different column.

```json
{ "cardId": "Kanban/Project.md::To Do::Write docs", "toColumn": "In Progress" }
```

---

## POST /cards/link
Link two cards across boards (adds a `[[wikilink]]` on the source card).

```json
{ "fromCardId": "...", "toCardId": "..." }
```

---

## GET /cards/links
Get all wikilinks on a card.

Query params: `cardId` (required)

---

## POST /cards/process-recurring
Scan all boards for checked recurring cards and recreate them in Backlog with next due date.

```json
{ "boardId": "Kanban/Project.md" }
```

Returns: `{ "ok": true, "recreated": N, "cards": ["Card Title", ...] }`

---

## POST /cards/archive
Archive done cards older than N days into `Kanban/archive/` (6.5). Moves checked cards out of the active board to keep it clean. Archive files use proper `kanban-plugin: board` frontmatter.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `boardId` | string | Yes | Board to clean up |
| `maxDays` | number | 7 | Only archive done cards older than this |
| `archiveFolder` | string | `Kanban/archive` | Where to write archive files |

Returns: `{ "ok": true, "archived": N }`

---

## GET /query
Query cards across all boards with filters.

Query params (all optional): `boardId`, `column`, `tag`, `blocked=true`, `overdue=true`

---

## GET /notify/due
Manually trigger an overdue card sweep. Returns list of overdue cards and which were newly notified. (Requires notifications enabled in settings.)

```json
{ "ok": true, "overdue": [{ "id": "...", "title": "...", "dueDate": "2026-04-01" }], "notified": ["..."] }
```

---

## GET /report/velocity
Get a weekly throughput report (read-only, does not write to vault).

Query params: `weeks` (default: 4)

---

## POST /ritual/standup
Daily standup summary. Optional body: `{ "boardId": "..." }`

Returns: in-progress cards, blocked cards, due-soon cards, summary text.

---

## POST /ritual/review
Weekly review report. Optional body: `{ "boardId": "..." }`

Returns: completed cards, carry-over, blocked cards, velocity count, summary.

---

## POST /ritual/velocity
Generate and write a velocity report to the vault (`{boardFolder}/reports/velocity-YYYY-Www.md`).

Body: `{ "weeks": 4 }` (optional)

Returns: `{ "ok": true, "path": "...", "summary": { numWeeks, total, average, weeks } }`

---

## Board Templates

Five pre-built column sets are available. Use them via `POST /boards` with `"template": "name"`, or `POST /templates/apply`.

| Name | Columns | Use Case |
|------|---------|----------|
| `default` | Backlog → To Do → In Progress → Review → Done | Standard kanban workflow |
| `sprint` | Backlog → Sprint Backlog → In Progress → Code Review → Done | Agile sprint with code review |
| `bug-triage` | Reported → Triaged → In Progress → QA Testing → Closed | Bug tracking lifecycle |
| `release` | Planned → Ready → In Progress → Staging → Released | Release pipeline |
| `personal` | Inbox → Today → This Week → Waiting → Done | Personal productivity / GTD-lite |

### GET /templates
List all available templates with columns and descriptions.

### GET /templates/:name
Get a specific template's details.

### POST /templates/apply
Create a board from a template.

Body:
```json
{ "title": "Sprint 12", "template": "sprint", "boardFolder": "Kanban" }
```

---

## Card Line Format

Cards in the markdown file use this format:
```
- [ ] Title | #priority | due:YYYY-MM-DD | @tag | blocked:reason | done:YYYY-MM-DD | recur:weekly | [[card-ref]]
```

Fields: `#high|medium|low`, `due:2026-05-01`, `@tagname`, `blocked:reason`, `done:2026-05-01` (when checked), `recur:daily|weekly|monthly|YYYY-MM-DD`, `[[wikilink]]`.

---

## Board Template File Format

Every board file MUST start with:
```yaml
---
kanban-plugin: board
---
```

Without this frontmatter, Obsidian renders the file as a plain markdown list instead of a visual Kanban board. The plugin API always includes this when creating boards.
