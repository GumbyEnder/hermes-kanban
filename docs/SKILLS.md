# Hermes Kanban Skills

Three Hermes skill files are included in skills/ to give Hermes natural language
control over your Kanban boards.

---

## kanban-orchestrator.md

Core orchestrator skill. Handles all CRUD operations on boards and cards.

Capabilities:
- Create new boards with custom columns
- Add, move, update cards
- Query by column, tag, blocked status, overdue
- Generate standup and review reports
- Fall back to direct Markdown writes if plugin is offline

Install: copy skills/kanban-orchestrator.md to your Hermes skills folder.

Invocation examples:
  "Create a board called Sprint 12 with columns Backlog, In Progress, Done"
  "Move the 'Write tests' card to In Progress"
  "Show me all blocked cards"
  "What's overdue on the Q3-Launch board?"

---

## project-breakdown-to-kanban.md

Project planning skill. Takes a high-level goal and breaks it into a structured
Kanban board with epics, tasks, and prioritized cards.

Capabilities:
- Decompose a goal into phases and tasks
- Auto-assign priorities and estimated due dates
- Create the board via the REST API in one shot
- Suggest column structure based on project type (engineering, marketing, etc.)

Invocation examples:
  "Break down 'Launch the mobile app' into a Kanban board"
  "Create a project plan for a 3-month content calendar"
  "Plan out the Q4 roadmap as a Kanban board"

---

## kanban-rituals.md

Planning ritual skill. Runs structured daily/weekly ceremonies using board data.

Capabilities:
- Daily standup: in-progress items, blockers, due-today list
- Weekly review: velocity, carry-over, blocked items, retrospective prompts
- Backlog grooming: flag stale cards, suggest priorities
- Sprint planning: pick cards from backlog, set due dates

Invocation examples:
  "Run my daily standup"
  "Give me a weekly review of the Q3-Launch board"
  "Groom the backlog on Sprint 12"
  "Plan next sprint from the backlog"

---

## Fallback mode

All skills check /health before making write calls. If the plugin is offline,
skills fall back to generating Markdown directly and asking you to paste it into
your vault. No data is lost if the plugin isn't running.

---

## Installation

Manual:
    cp skills/*.md ~/.hermes/skills/

Via install.sh (also installs the plugin):
    bash scripts/install.sh
