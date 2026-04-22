# Hermes Kanban Bridge — REST API Reference

Base URL: `http://localhost:27124` (port configurable in plugin settings)

All responses are JSON. Write operations return `{ ok: true, message }` or `{ ok: false, error }`.

---

## GET /health

Check if the plugin server is running.

Response:
```json
{
  "ok": true,
  "status": "running",
  "port": 27124,
  "version": "1.0.0"
}
```

---

## GET /boards

List all Kanban boards in the configured board folder.

Response:
```json
{
  "ok": true,
  "boards": [
    { "id": "Kanban/Q3-Launch.md", "title": "Q3-Launch", "path": "Kanban/Q3-Launch.md", "cardCount": 12 }
  ]
}
```

---

## GET /boards/:id

Get full board state including all columns and cards.

Params: `:id` = URL-encoded board path (e.g. `Kanban%2FQ3-Launch.md`)

Response:
```json
{
  "ok": true,
  "board": {
    "id": "Kanban/Q3-Launch.md",
    "title": "Q3-Launch",
    "path": "Kanban/Q3-Launch.md",
    "columns": ["Backlog", "To Do", "In Progress", "Review", "Done"],
    "cards": [
      {
        "id": "Kanban/Q3-Launch.md::In Progress::Landing page redesign",
        "title": "Landing page redesign",
        "column": "In Progress",
        "boardId": "Kanban/Q3-Launch.md",
        "priority": "high",
        "dueDate": "2026-06-01",
        "tags": ["eng"],
        "blocked": false,
        "checked": false
      }
    ]
  }
}
```

---

## POST /boards

Create a new Kanban board.

Body:
```json
{
  "title": "My New Project",
  "columns": ["Backlog", "To Do", "In Progress", "Done"],
  "boardFolder": "Kanban"
}
```

Response:
```json
{
  "ok": true,
  "board": {
    "id": "Kanban/My New Project.md",
    "title": "My New Project",
    "path": "Kanban/My New Project.md",
    "columns": ["Backlog", "To Do", "In Progress", "Done"],
    "cards": []
  }
}
```

---

## POST /cards

Add a new card to a board column.

Body:
```json
{
  "boardId": "Kanban/Q3-Launch.md",
  "column": "To Do",
  "title": "Write release notes",
  "priority": "high",
  "dueDate": "2026-06-20",
  "tags": ["docs"],
  "blocked": false
}
```

Response:
```json
{
  "ok": true,
  "card": {
    "id": "Kanban/Q3-Launch.md::To Do::Write release notes",
    "title": "Write release notes",
    "column": "To Do",
    "boardId": "Kanban/Q3-Launch.md"
  }
}
```

---

## PUT /cards/:id

Update an existing card's metadata. `:id` = URL-encoded card id.

Card ID format: `boardPath::column::title`

Body (all fields optional):
```json
{
  "priority": "medium",
  "dueDate": "2026-07-01",
  "tags": ["docs", "launch"],
  "blocked": true,
  "blockerReason": "Waiting on legal review"
}
```

Response:
```json
{ "ok": true, "message": "Updated card \"Write release notes\"" }
```

---

## POST /cards/move

Move a card from one column to another.

Body:
```json
{
  "cardId": "Kanban/Q3-Launch.md::To Do::Write release notes",
  "toColumn": "In Progress"
}
```

Response:
```json
{ "ok": true, "message": "Moved \"Write release notes\" from \"To Do\" to \"In Progress\"" }
```

---

## GET /query

Query cards across boards with filters.

Query params (all optional):
- `boardId` — filter to a specific board (URL-encoded path)
- `column` — filter by column name
- `tag` — filter by tag (e.g. `@eng`)
- `blocked=true` — only blocked cards
- `overdue=true` — only cards with dueDate before today

Example: `GET /query?blocked=true`

Response:
```json
{
  "ok": true,
  "cards": [
    {
      "id": "Kanban/Q3-Launch.md::In Progress::Landing page",
      "title": "Landing page",
      "column": "In Progress",
      "blocked": true,
      "blockerReason": "Waiting on design assets"
    }
  ]
}
```

---

## POST /ritual/standup

Generate a daily standup summary across all boards (or a specific board).

Body (optional):
```json
{ "boardId": "Kanban/Q3-Launch.md" }
```

Response:
```json
{
  "ok": true,
  "standup": {
    "generated": "2026-04-22T15:00:00.000Z",
    "inProgress": [
      { "title": "Landing page redesign", "board": "Kanban/Q3-Launch.md", "priority": "high" }
    ],
    "blocked": [
      { "title": "Landing page", "reason": "Waiting on design assets", "board": "Kanban/Q3-Launch.md" }
    ],
    "dueSoon": [],
    "summary": "1 in progress, 1 blocked, 0 due today/overdue"
  }
}
```

---

## POST /ritual/review

Generate a weekly review report.

Body (optional):
```json
{ "boardId": "Kanban/Q3-Launch.md" }
```

Response:
```json
{
  "ok": true,
  "review": {
    "generated": "2026-04-22T15:00:00.000Z",
    "completed": [
      { "title": "Stakeholder alignment meeting", "board": "Kanban/Q3-Launch.md" }
    ],
    "carryOver": [
      { "title": "Landing page redesign", "column": "In Progress", "priority": "high" }
    ],
    "blocked": [],
    "velocity": 2,
    "summary": "Completed: 2. Carry-over: 10. Blocked: 0."
  }
}
```
