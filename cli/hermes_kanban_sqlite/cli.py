"""
CLI entry point for hermes-kanban-sqlite.

Usage:
  hermes-kanban-sqlite init <project>         — Initialize a new Kanban board
  hermes-kanban-sqlite list [column]          — List cards, optionally filtered by column
  hermes-kanban-sqlite add <title>            — Add a card to the current board
  hermes-kanban-sqlite move <card_id> <col>   — Move a card between columns
  hermes-kanban-sqlite info <card_id>         — Show detailed card information
  hermes-kanban-sqlite comment <card_id> <text> — Add a comment to a card
  hermes-kanban-sqlite dependency <a> <b>     — Create blocking relationship
"""
import click
from pathlib import Path
import sqlite3

from .database import init_schema, get_connection, STANDARD_COLUMNS
from .kanban import (
    KanbanError,
    create_board,
    list_boards,
    list_cards,
    create_card,
    get_card,
    update_card,
    archive_card,
    add_comment,
    add_dependency,
    get_dependencies,
    get_all_columns,
)
from .tui import run_tui
from .sync import sync_to_obsidian

DEFAULT_DB_DIR = Path.home() / ".hermes"
DEFAULT_DB_PATH = DEFAULT_DB_DIR / "kanban.db"


def _get_db_path() -> str:
    """Return the default database path, creating parent directory if needed."""
    DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
    return str(DEFAULT_DB_PATH)


@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx):
    """Hermes Kanban SQLite — Standalone terminal Kanban CLI/TUI.

    Initialize with 'hermes-kanban-sqlite init <project>' or use
    commands directly against the default database at ~/.hermes/kanban.db
    """
    if ctx.invoked_subcommand is None:
        db_path = _get_db_path()
        if Path(db_path).exists():
            click.echo(f"✅ Kanban database: {db_path}")
            boards = list_boards(db_path)
            if boards:
                click.echo(f"\n📋 {len(boards)} board(s) found:")
                for b in boards:
                    click.echo(f"  • {b['name']} (id={b['id']})")
            click.echo("\nRun 'hermes-kanban-sqlite --help' for commands.")
        else:
            click.echo(f"📁 No Kanban database at {db_path}")
            click.echo("Run 'hermes-kanban-sqlite init <project>' to create a board.")


@cli.command()
@click.argument("project_name")
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path (default: ~/.hermes/kanban.db)")
def init(project_name, db_path):
    """Initialize a new Kanban board.

    PROJECT_NAME — Name for the new board (e.g. "Project-X-Backlog")
    """
    if db_path is None:
        db_path = _get_db_path()

    conn = get_connection(db_path)
    try:
        init_schema(db_path)
        click.echo(f"✅ Schema initialized")

        board_id = create_board(db_path, project_name)
        click.echo(f"📋 Board created: {project_name} (id={board_id})")

        # Seed standard columns
        for name, desc, color, order in STANDARD_COLUMNS:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    "INSERT OR IGNORE INTO columns (name, description, color, sort_order) "
                    "VALUES (?, ?, ?, ?)",
                    (name, desc, color, order),
                )
            except sqlite3.IntegrityError:
                pass
        conn.commit()
        click.echo("✅ Standard columns seeded")

        click.echo(f"\n💾 Database: {db_path}")
        click.echo("🎯 Next: hermes-kanban-sqlite add <title> — Add a card")

    except KanbanError as e:
        click.echo(f"❌ {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        raise SystemExit(1)


@cli.command()
@click.argument("column", required=False)
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path")
def list(column, db_path):
    """List all cards, optionally filtered by COLUMN."""
    if db_path is None:
        db_path = _get_db_path()

    try:
        cards = list_cards(db_path, column_name=column)
        columns = get_all_columns(db_path)

        if not cards:
            click.echo("📭 No cards found.")
            if column:
                click.echo(f"   (filtered by column: {column})")
            return

        # Group by column
        by_column = {}
        for col in columns:
            by_column[col["name"]] = []
        for card in cards:
            cn = card.get("column_name", "Unknown")
            if cn not in by_column:
                by_column[cn] = []
            by_column[cn].append(card)

        for col_name, col_cards in by_column.items():
            if column and col_name != column:
                continue
            if not col_cards:
                continue
            color = next((c["color"] for c in columns if c["name"] == col_name), "#6c757d")
            click.echo(click.style(f"\n📂 {col_name} ({len(col_cards)})", fg="bright_white", bold=True))
            for card in col_cards:
                click.echo(f"  [{card['id']}] {card['title']}")

    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)


@cli.command()
@click.argument("title")
@click.option("--column", default="To Do", help="Column to place card in (default: 'To Do')")
@click.option("--description", default="", help="Card description")
@click.option("--tags", default="", help="Comma-separated tags")
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path")
def add(title, column, description, tags, db_path):
    """Add a new card to the board."""
    if db_path is None:
        db_path = _get_db_path()

    try:
        boards = list_boards(db_path)
        if not boards:
            click.echo("❌ No boards exist. Run 'hermes-kanban-sqlite init <project>' first.", err=True)
            return
        board_id = boards[0]["id"]  # Use the first board

        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None

        card_id = create_card(db_path, board_id, title, column, description or "", tag_list)
        click.echo(f"✅ Card created: [{card_id}] {title}")
        click.echo(f"   Column: {column}")

    except KanbanError as e:
        click.echo(f"❌ {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        raise SystemExit(1)


@cli.command()
@click.argument("card_id", type=int)
@click.argument("column")
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path")
def move(card_id, column, db_path):
    """Move a card to a different column.

    CARD_ID — Numeric ID of the card
    COLUMN — Target column name (e.g. 'In Progress', 'Done')
    """
    if db_path is None:
        db_path = _get_db_path()

    try:
        card = get_card(db_path, card_id)
        if not card:
            click.echo(f"❌ Card {card_id} not found.", err=True)
            return

        old_column = card["column_name"]
        if old_column == column:
            click.echo(f"ℹ️  Card {card_id} is already in '{column}'.")
            return

        ok = update_card(db_path, card_id, column_name=column)
        if ok:
            click.echo(f"✅ Card {card_id} moved: '{old_column}' → '{column}'")
        else:
            click.echo(f"❌ Failed to move card {card_id}.", err=True)

    except KanbanError as e:
        click.echo(f"❌ {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        raise SystemExit(1)


@cli.command()
@click.argument("card_id", type=int)
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path")
def info(card_id, db_path):
    """Show detailed information for a card."""
    if db_path is None:
        db_path = _get_db_path()

    try:
        card = get_card(db_path, card_id)
        if not card:
            click.echo(f"❌ Card {card_id} not found.", err=True)
            return

        click.echo(click.style(f"\n🎴 Card #{card['id']}", fg="bright_white", bold=True))
        click.echo(f"   Title:       {card['title']}")
        click.echo(f"   Column:      {card['column_name']}")
        click.echo(f"   Status:      {card['status']}")
        click.echo(f"   Description: {card.get('description', '') or '(none)'}")
        click.echo(f"   Created:     {card.get('created_at', '')}")
        click.echo(f"   Updated:     {card.get('updated_at', '')}")

        # Tags
        tags = card.get("tags", [])
        if tags:
            tag_names = ", ".join(t["name"] for t in tags)
            click.echo(f"   Tags:        {tag_names}")
        else:
            click.echo(f"   Tags:        (none)")

        # Comments
        comments = card.get("comments", [])
        if comments:
            click.echo(f"\n💬 Comments ({len(comments)}):")
            for c in comments:
                click.echo(f"   [{c['created_at']}] {c['author']}: {c['content']}")

        # Dependencies
        deps = get_dependencies(db_path, card_id)
        blockers = deps.get("blockers", [])
        blocked_by = deps.get("blocked_by", [])
        if blockers:
            click.echo(f"\n🔒 Blocked by:")
            for b in blockers:
                click.echo(f"   [{b['id']}] {b['title']} ({b['column_name']})")
        if blocked_by:
            click.echo(f"\n🔓 Blocks:")
            for b in blocked_by:
                click.echo(f"   [{b['id']}] {b['title']} ({b['column_name']})")

    except KanbanError as e:
        click.echo(f"❌ {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        raise SystemExit(1)


@cli.command()
@click.argument("card_id", type=int)
@click.argument("text")
@click.option("--author", default="CLI User", help="Comment author name")
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path")
def comment(card_id, text, author, db_path):
    """Add a comment to a card."""
    if db_path is None:
        db_path = _get_db_path()

    try:
        comment_id = add_comment(db_path, card_id, author, text)
        click.echo(f"✅ Comment added (id={comment_id}) to card {card_id}")

    except KanbanError as e:
        click.echo(f"❌ {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        raise SystemExit(1)


@cli.command()
@click.argument("blocker_id", type=int)
@click.argument("blocked_id", type=int)
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path")
def dependency(blocker_id, blocked_id, db_path):
    """Create a blocking relationship between cards.

    BLOCKER_ID — The card that blocks another
    BLOCKED_ID — The card that is blocked
    """
    if db_path is None:
        db_path = _get_db_path()

    try:
        dep_id = add_dependency(db_path, blocker_id, blocked_id)
        click.echo(f"✅ Dependency created (id={dep_id}): card {blocker_id} blocks card {blocked_id}")

    except KanbanError as e:
        click.echo(f"❌ {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        raise SystemExit(1)


@cli.command()
@click.option("--project", default="Hermes Demo",
              help="Board project name (default: 'Hermes Demo')")
@click.option("--board", default="Main",
              help="Board name for this demo (default: 'Main')")
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path (default: ~/.hermes/kanban.db)")
def demo(project, board, db_path):
    """Seed a polished sample Kanban board for TUI demonstration.

    PROJECT — Name of the board project (e.g. 'Hermes Demo', 'Project-X')
    BOARD  — Name of the board within that project
    """
    if db_path is None:
        db_path = _get_db_path()

    try:
        # Get first existing board ID, or create new one
        boards = list_boards(db_path)
        
        # Ensure columns exist (requires conn - define early)
        conn = get_connection(db_path)
        cursor = conn.cursor()
        standard_col_names = [name for name, _, _, _ in STANDARD_COLUMNS]
        missing_cols = [name for name in standard_col_names if name not in get_all_columns(db_path)]
        
        # Create board if needed
        if not boards:
            click.echo("🔧 No boards exist. Creating demo board...")
            cursor.execute(
                "INSERT INTO boards (name, description) VALUES (?, ?)",
                (board or "Main", f"Demo board seeded by hermes-kanban-sqlite demo command")
            )
            conn.commit()
            # SQLite3 uses last_insert_rowid() instead of cursor.lastrowid
            cursor.execute("SELECT last_insert_rowid()")  
            row = cursor.fetchone()
            if row:
                board_id = row[0]
            else:
                board_id = 1  # Default fallback
        else:
            board_id = boards[0]["id"]  # Use first existing board
        
        # Ensure columns exist
        if missing_cols:
            click.echo(f"📋 Ensuring columns: {', '.join(missing_cols)}")
            for name, desc, color, order in STANDARD_COLUMNS:
                try:
                    cursor.execute(
                        "INSERT OR IGNORE INTO columns (name, description, color, sort_order) VALUES (?, ?, ?, ?)",
                        (name, desc, color.lower(), order),
                    )
                except sqlite3.IntegrityError:
                    pass
        else:
            click.echo("✅ Standard columns already exist")
        conn.commit()
        
        # Seed 14 realistic cards with varied titles, tags, and metadata
        demo_cards = [
            # Column: Backlog (3 cards)
            {
                "title": "Design sync schema",
                "column": "Backlog",
                "description": "Create database schema for bidirectional sync between SQLite and external Kanban instances.",
                "tags": ["backend", "devops"],
                "due_date": "2026-05-13",
            },
            {
                "title": "Investigate DB lock contention",
                "column": "Backlog",
                "description": "Profile SQLite connection pool and identify deadlock scenarios under concurrent TUI access.",
                "tags": ["backend", "devops"],
                "due_date": "2026-05-18",
            },
            {
                "title": "Create board templates API",
                "column": "Backlog",
                "description": "Build REST endpoints to create pre-configured Kanban boards with columns and default cards.",
                "tags": ["backend", "devops"],
            },
            # Column: To Do (4 cards)
            {
                "title": "Fix TUI column layout",
                "column": "To Do",
                "description": "Adjust column widths so 'Blocked' and 'Done' fit properly in the Textual render.",
                "tags": ["frontend", "ui/ux"],
                "due_date": "2026-05-08",
            },
            {
                "title": "Add auto-refresh to TUI",
                "column": "To Do",
                "description": "Implement polling for new cards/columns without requiring manual redraw trigger.",
                "tags": ["frontend", "devops"],
                "due_date": "2026-05-15",
            },
            {
                "title": "Write sync bridge tests",
                "column": "To Do",
                "description": "Add pytest coverage for the sync_to_obsidian function with edge cases.",
                "tags": ["frontend", "qa"],
                "due_date": "2026-05-10",
            },
            {
                "title": "Document CLI commands",
                "column": "To Do",
                "description": "Expand README with examples for add, move, info, and dependency subcommands.",
                "tags": ["docs", "qa"],
                "due_date": "2026-05-12",
            },
            # Column: In Progress (4 cards)
            {
                "title": "Review PR #7 feedback",
                "column": "In Progress",
                "description": "Address code review comments around database connection pooling in kanban.py.",
                "tags": ["frontend", "backend"],
                "due_date": "2026-05-09",
            },
            {
                "title": "Benchmark SQLite performance",
                "column": "In Progress",
                "description": "Run load tests with 100+ cards across columns to identify scaling bottlenecks.",
                "tags": ["backend", "devops"],
                "due_date": "2026-05-20",
            },
            {
                "title": "Implement GitHub Issues import",
                "column": "In Progress",
                "description": "Create parser to extract issue data from GitHub API and create Kanban cards.",
                "tags": ["backend", "devops"],
                "due_date": "2026-05-14",
            },
            {
                "title": "Update CI/CD pipeline",
                "column": "In Progress",
                "description": "Add automated deployment workflow for hermes-kanban-sqlite releases.",
                "tags": ["devops", "backend"],
                "due_date": "2026-05-19",
            },
            # Column: Review (3 cards)
            {
                "title": "Deploy to Cloudflare",
                "column": "Review",
                "description": "Set up Cloudflare Pages deployment for web-based Kanban demo.",
                "tags": ["devops", "frontend"],
                "due_date": "2026-05-11",
            },
            {
                "title": "Blocked: API gateway routing",
                "column": "Review",
                "description": "Configure Cloudflare Workers to route Kanban webhook events.",
                "tags": ["devops", "backend"],
                "is_blocked": True,
            },
        ]

        # Track summary stats
        tags_set = set()
        comments_count = 0
        dependency_created = False

        for card_data in demo_cards:
            tag_list = [t.strip() for t in card_data.get("tags", []) if t.strip()] if card_data.get("tags") else None
            
            # Add due date description to cards without it
            due_date = card_data.get("due_date")
            if due_date:
                desc = (card_data.get("description", "") + f"\n   📅 Due: {due_date}")
            else:
                desc = card_data.get("description", "")

            # Track tags
            for tag in tag_list or []:
                tags_set.add(tag)

            # Create the card
            card_id = create_card(db_path, board_id, 
                                  title=card_data["title"],
                                  column_name=card_data["column"],
                                  description=desc,
                                  tags=tag_list or None)

            # Add a comment to 2 cards (To Do: Fix TUI and Document CLI)
            if card_data["column"] == "To Do" and card_data["title"] in ["Fix TUI column layout", "Document CLI commands"]:
                add_comment(db_path, card_id, "Demo Bot", f"🔨 TODO: Address this during demo. Priority: {card_data.get('due_date', 'N/A')}")
                comments_count += 1

        # Create one dependency pair (In Progress: Review PR blocks In Progress: GitHub Issues)
        review_pr_id = None
        github_issues_id = None
        for card_data in demo_cards:
            title = card_data["title"]
            if title == "Review PR #7 feedback":
                review_pr_id = card_id
            elif title == "Implement GitHub Issues import":
                github_issues_id = card_id

        if review_pr_id and github_issues_id:
            add_dependency(db_path, review_pr_id, github_issues_id)
            click.echo(f"  🔗 Dependency created: {review_pr_id} blocks {github_issues_id}")
        
        # Print summary
        click.echo("\n" + "="*60)
        click.echo(click.style("✅ Demo board seeded!", fg="bright_green", bold=True))
        click.echo(f"   📋 Columns: {len(standard_col_names)} ({', '.join(standard_col_names)})")
        click.echo(f"   🎴 Cards: 14 distributed across columns")
        click.echo(f"   🏷️  Tags: {sorted(tags_set) if tags_set else 'none'}")
        click.echo(f"   💬 Comments added: {comments_count}")
        click.echo(f"   🔗 Dependencies created: {'Yes' if dependency_created else 'No (yet)'}")
        click.echo("="*60 + "\n")

    except KanbanError as e:
        click.echo(f"❌ {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        raise SystemExit(1)


@cli.command()
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path (default: ~/.hermes/kanban.db)")
@click.option("--vault-dir", type=click.Path(), default="/mnt/nas/Obsidian Vault/Kanban",
              help="Obsidian vault Kanban directory")
@click.option("--board", default=None, help="Board name (default: first board in DB)")
def sync(db_path, vault_dir, board):
    """Sync SQLite cards to an Obsidian Kanban markdown board."""
    if db_path is None:
        db_path = _get_db_path()

    if not Path(db_path).exists():
        click.echo(f"❌ No database at {db_path}", err=True)
        click.echo("Run 'hermes-kanban-sqlite init <project>' first.")
        raise SystemExit(1)

    click.echo("🔄 Syncing SQLite → Obsidian...")
    result = sync_to_obsidian(db_path, vault_dir, board)

    if result["errors"]:
        for err in result["errors"]:
            click.echo(f"  ⚠️  {err}", err=True)

    click.echo(f"✅ Synced {result['cards_synced']} cards across {result['columns_synced']} columns")
    click.echo(f"📄 Board: {result['board_file']}")


@cli.command()
@click.argument("card_id", type=int)
@click.option("--yes", is_flag=True, help="Skip confirmation prompt")
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path (default: ~/.hermes/kanban.db)")
def archive(card_id, yes, db_path):
    """Archive (soft-delete) a card."""
    if db_path is None:
        db_path = _get_db_path()

    try:
        card = get_card(db_path, card_id)
        if not card:
            click.echo(f"❌ Card {card_id} not found.", err=True)
            return

        if not yes:
            click.confirm(
                f"Archive card [{card_id}] '{card['title']}'?",
                abort=True
            )

        ok = archive_card(db_path, card_id)
        if ok:
            click.echo(f"✅ Card {card_id} archived.")
        else:
            click.echo(f"❌ Failed to archive card {card_id}.", err=True)

    except click.Abort:
        click.echo("Cancelled.")
    except KanbanError as e:
        click.echo(f"❌ {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        raise SystemExit(1)


@cli.command()
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path (default: ~/.hermes/kanban.db)")
def tui(db_path):
    """Launch the interactive terminal UI (Textual)."""
    if db_path is None:
        db_path = _get_db_path()

    if not Path(db_path).exists():
        click.echo(f"❌ No database at {db_path}", err=True)
        click.echo("Run 'hermes-kanban-sqlite init <project>' first.")
        raise SystemExit(1)

    click.echo(f"🎬 Launching Kanban TUI with database: {db_path}")
    run_tui(db_path)


def main():
    """Entry point for pyproject.toml console_scripts."""
    cli()


if __name__ == "__main__":
    main()
