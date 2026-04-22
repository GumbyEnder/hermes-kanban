---
name: kanban-rituals
description: Daily standup and weekly review rituals for Obsidian Kanban boards via the hermes-kanban-bridge plugin. Generates structured summaries, proposes card movements, tracks velocity, and surfaces blockers. Use every morning for standup or end-of-week for review.
version: 1.0.0
category: productivity
metadata:
  hermes:
    tags: [kanban, standup, review, rituals, planning, retrospective]
    related_skills: [kanban-orchestrator, project-breakdown-to-kanban]
---

# Kanban Rituals

Daily standup and weekly review procedures for Obsidian Kanban boards.

## Daily Standup

### When to run

- User says "run my standup", "daily standup", "what's the status", "what should I focus on today"
- First thing in the morning

### Procedure

1. Check plugin health: `GET http://localhost:27124/health`

2. Generate standup:
```
POST http://localhost:27124/ritual/standup
{ "boardId": "Kanban/MyProject.md" }   // omit boardId for all boards
```

3. Parse response and present clearly:

```
DAILY STANDUP — [date]

IN PROGRESS ([n]):
  - [title] | [board] | [priority] | due: [date or none]

BLOCKED ([n]):
  - [title] — [reason]

DUE TODAY / OVERDUE ([n]):
  - [title] | [column] | due: [date]

SUMMARY: [standup.summary]
```

4. Propose next actions:
   - For each blocked card: suggest resolution or escalation
   - For each overdue card: propose moving to Blocked or adjusting due date
   - Suggest which In Progress card to focus on first (highest priority + earliest due)

5. Ask: "Shall I move any cards or update any status?"

6. Apply confirmed changes via `POST /cards/move` or `PUT /cards/:id`

### Fallback (no plugin)

Read all Markdown boards in the vault Kanban folder. Parse `## In Progress`, `## Blocked` sections. Identify cards with `due:` dates that are today or past. Present in same format.

---

## Weekly Review

### When to run

- User says "weekly review", "end of week review", "how did the week go"
- Friday or start of the following Monday

### Procedure

1. Generate review:
```
POST http://localhost:27124/ritual/review
{ "boardId": "Kanban/MyProject.md" }   // omit for all boards
```

2. Present review report:

```
WEEKLY REVIEW — week of [date]

COMPLETED ([n]):
  - [title]
  - ...

CARRY-OVER ([n]):
  - [title] | [column] | [priority]
  - ...

BLOCKED ([n]):
  - [title] — [reason]

VELOCITY: [n] cards completed

SUMMARY: [review.summary]
```

3. Review carry-over cards:
   - Should any be reprioritized?
   - Should any be cancelled (scope creep)?
   - Should any be split into smaller cards?

4. Propose next week's focus:
   - Top 3 cards to prioritize
   - Any blockers to resolve first

5. Ask: "Shall I move any cards to set up next week?"

6. Apply confirmed changes.

### Velocity tracking

Track velocity over time by noting weekly completed counts in a running Obsidian note:

```
Velocity Log — [Project Name]
2026-04-22: 5 completed
2026-04-29: 3 completed
...
```

Offer to create/update this note after each weekly review.

---

## Ritual Output Quality Standards

- Always show counts per section (never just "none" without a count)
- Surface blockers first — they need the most attention
- Keep the output scannable — no walls of text
- End with a clear question: "Shall I apply any of these changes?"
- Never apply changes without explicit user confirmation (unless in auto-trust mode)
