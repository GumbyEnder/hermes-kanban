# Hermes Kanban SQLite CLI

Fast, local kanban board with TUI and one-way sync to Obsidian markdown.

```
Usage: hermes-kanban-sqlite [OPTIONS] COMMAND [ARGS]...

Options:
  --db-path PATH          Path to SQLite database [default: ~/.hermes/kanban.db]
  --help                  Show this message and exit.

Commands:
  init       Initialize a new board/project
  list       List all cards (filterable)
  add        Add a new card
  move       Move a card to a different column
  info       Show detailed card info
  comment    Add a comment to a card
  dependency Link two cards (A blocks B)
  archive    Archive a card
  tui        Launch the interactive TUI
  sync       Export board to Obsidian markdown
  demo       Seed a polished sample board for TUI demo
```

---

## Install

```bash
cd /mnt/nas/github_repos/hermes-kanban-main/cli
pip install -e .
```

This registers `hermes-kanban-sqlite` as a console script.

---

## Quick Start

```bash
# 1. Create a new board
hermes-kanban-sqlite init "Project Apollo"

# 2. Add some cards
hermes-kanban-sqlite add "Design schema" --tag backend --column "Backlog"
hermes-kanban-sqlite add "Fix login bug" --tag frontend --column "To Do"

# 3. See it in the TUI
hermes-kanban-sqlite tui

# 4. Sync to Obsidian (writes to Vault/Kanban/)
hermes-kanban-sqlite sync --vault-dir "/mnt/nas/Obsidian Vault"
```

---

## Commands

### `init <project_name>`
Create a new board/project. Standard columns (Backlog, To Do, In Progress, Review, Done, Blocked) are auto-created.

### `add "<title>" [--tag <tag>...] [--column <col>] [--due <date>]`
Add a card. Tags are created on-demand. Due date accepts ISO format (`YYYY-MM-DD`) or relative (`in 7 days`).

### `list [--column <col>] [--tag <tag>] [--archived]`
List cards matching filters. Shows ID, title, column, tags, blocked status.

### `move <card_id> <target_column>`
Move a card to a different column.

### `info <card_id>`
Show full card details: title, description, column, tags, due date, blocked flag, created/updated timestamps.

### `comment <card_id> "<text>"`
Add a comment to an existing card.

### `dependency <blocks_card_id> <blocked_card_id>`
Create a dependency: `blocks_card_id` → `blocked_card_id`. Enforces no self-dependency.

### `archive <card_id>`
Mark a card as archived (hidden from default list/TUI unless `--archived` passed).

### `tui [--db-path <path>]`
Launch the interactive Textual TUI. Displays columns horizontally; navigate with keys:
- `Enter` — select card (shows details)
- `d` — archive selected card
- `Esc` — clear selection
- `q` — quit

### `sync [--vault-dir <path>] [--board <name>]`
Export the board to Obsidian markdown. Creates `{vault_dir}/Kanban/{board_name}.md` using checkbox syntax (`[ ]`, `[-]`, `[x]`). Auto-seeds columns if empty.

### `demo [--project <name>] [--board <name>] [--db-path <path>]`
Seed a polished sample board for TUI demonstration. Creates 14 realistic cards spread across all columns, with varied tags, a few due dates, two comments, and one dependency pair. Perfect for trying out the TUI instantly.

---

## Database Schema

| Table        | Purpose                        |
|--------------|--------------------------------|
| `boards`     | Project/board names            |
| `columns`    | Column definitions per board   |
| `cards`      | Tasks (title, description, etc)|
| `tags`       | Tag vocabulary                 |
| `card_tags`  | Card→tag many-to-many          |
| `dependencies`| Card blocks another card      |
| `comments`   | Card discussion threads        |

SQLite file defaults to `~/.hermes/kanban.db` (configurable via `--db-path`).

---

## TUI Design & Tech

**Framework:** [Textual](https://textual.textualize.io/) (Python TUI框架, Textual 8.x)

**Architecture:**
- `KanbanApp` — main `Textual` application entry point
- `KanbanBoard` — screen containing all columns
- `KanbanColumn` — container for cards in one status column
- `KanbanCard` — individual task widget

Widget IDs follow Textual's strict pattern: `[a-zA-Z_-][a-zA-Z0-9_-]*`. Card IDs are generated as `card-{db_id}` (never raw titles) to avoid spaces/invalid chars.

**Layout:** Horizontal column flow (Flex/Grid). Each column shows a header (📂 Column Name (count)) and a vertical stack of cards.

**Styling:** CSS classes defined in `tui.py` and/or external `.tcss` files. Colors and spacing can be customized without touching Python logic.

---

## Terminal Aesthetic Enhancements (S1.2–S1.8 ideas)

These are future polish items that fit the terminal-friendly aesthetic:

### Tag Color Coding
Map tag names → color badges in TUI:
```
backend  →  🔵 blue
frontend →  🟢 green
devops   →  🟡 yellow
docs     →  ⚪ white
qa       →  🔴 red
blocked  →  ⚫ bold red
```
Render tag badges with background colors using Textual's `Rich` rendering.

### Due Date Urgency
- Due today → red badge (`URGENT`)
- Due within 3 days → yellow
- Overdue → blinking/flashing (Textual `watch` + CSS animation)

### Column Width Auto-fit
Dynamic column sizing based on card count; minimum width for readability; horizontal scroll if overflow.

### Card Priority Indicators
Small icon prefix: `🔴` (high), `🟡` (medium), `🔵` (low), `⚪` (none)

### Smooth Transitions
Textual supports animations: card move → slide; column expand → fade.

### Dark Mode Theme
Built-in dark theme with high-contrast card borders and subtle column separators.

### Keyboard Shortcuts
- `n` — new card (popup form)
- `e` — edit selected card (title/desc/tags)
- `c` — add comment to selected
- `r` — refresh/requery DB
- `?` — help overlay

### Filter/Search Bar
Top-side query input to live-filter cards by title/tag across all columns.

### Card Age Visualization
Fade title color based on `created_at` age (fresh → bright, old → dim).

### Dependencygraph View
Toggle to overlay dependency arrows between cards (Graphviz/ASCII-rendered).

---

## Development

```bash
cd /mnt/nas/github_repos/hermes-kanban-main/cli
source /home/gumbyender/venvs/kanban-cli/bin/activate
pip install -e .[dev]   # if dev extras defined
python -m pytest tests/ -v
```

All code changes should include tests. Target: **≥80% coverage** on core business logic.

---

## CI/CD

GitHub Actions workflow `.github/workflows/build.yml` runs on every push:
1. Builds TypeScript plugin (if changed)
2. Installs Python + dependencies
3. Runs `pytest -v`
4. Uploads test results as artifacts

PR #7 adds the SQLite CLI feature; merge triggers v1.7 release.

---

## License

Same license as parent repository (see root `LICENSE`).
