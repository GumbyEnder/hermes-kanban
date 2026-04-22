---
name: project-breakdown-to-kanban
description: Turn any goal, feature request, launch plan, or initiative into a well-structured Obsidian Kanban board. Decomposes goals into actionable cards with priorities, owners, due dates, and dependencies. Use before executing any multi-step project.
version: 1.0.0
category: productivity
metadata:
  hermes:
    tags: [kanban, project-management, planning, breakdown, execution]
    related_skills: [kanban-orchestrator, kanban-rituals]
---

# Project Breakdown to Kanban

Turn any goal into a structured Kanban board ready for execution.

## When to Use

- User says "break this down", "plan this out", "make a board for X"
- Starting a new project, feature, launch, or initiative
- Existing project needs restructuring

## Process

### Step 1 — Clarify scope

Ask (or infer from context):
- What is the goal? What does success look like?
- What is the deadline (if any)?
- Who are the owners/stakeholders?
- What are the known constraints or dependencies?
- Should the board track a team or a solo project?

### Step 2 — Choose columns

Default set: `Backlog | To Do | In Progress | Review | Done`

Add columns when needed:
- `Blocked` — items stalled on external dependency
- `Waiting` — items pending someone else's action
- `Cancelled` — explicitly killed scope

### Step 3 — Decompose the goal

Break into cards following these rules:
- Each card = one actionable unit of work (1–5 hours)
- Title is a verb phrase: "Write landing page copy", not "Landing page"
- Assign priority: high (blocking/critical path), medium (important), low (nice-to-have)
- Set due dates on cards that are time-sensitive
- Tag cards by owner/area: `@eng`, `@design`, `@marketing`, `@ops`
- Mark blockers explicitly: `blocked:waiting on legal sign-off`

### Step 4 — Place cards in the right starting column

- Not yet started → Backlog or To Do
- Already in flight → In Progress
- Already done → Done
- Waiting on external → Blocked or Waiting

### Step 5 — Create the board

Check plugin health first:
```
GET http://localhost:27124/health
```

If plugin is up:
```
POST http://localhost:27124/boards
{
  "title": "Project Name",
  "columns": ["Backlog", "To Do", "In Progress", "Review", "Done"]
}
```

Then populate cards:
```
POST http://localhost:27124/cards
{
  "boardId": "Kanban/Project Name.md",
  "column": "To Do",
  "title": "Write landing page copy",
  "priority": "high",
  "dueDate": "2026-05-15",
  "tags": ["marketing"]
}
```

If plugin is offline: create the Markdown file directly in the vault Kanban folder.

### Step 6 — Confirm and hand off

- Show the user the full board breakdown before creating
- After creating: confirm card count per column
- Log board creation in Hermes board protocol (Brief + Ledger + Events)

## Card Quality Checklist

Before finalizing, verify each card:
- [ ] Title is a clear verb phrase
- [ ] Priority is set
- [ ] Owner tag assigned (if team project)
- [ ] Due date set if time-sensitive
- [ ] Blockers noted if known
- [ ] No card is too large (split if > 1 day of work)
- [ ] No duplicate or overlapping cards

## Example Output

```
Board: Q3 Product Launch
Columns: Backlog (4) | To Do (2) | In Progress (2) | Review (1) | Done (2)

High priority In Progress:
- Launch landing page redesign | due:2026-06-01 | @eng
- Email sequence draft | @marketing

Blocked:
- (none)
```
