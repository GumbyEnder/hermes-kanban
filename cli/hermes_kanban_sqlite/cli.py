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
@click.argument("card_id", type=int)
@click.option("--yes", is_flag=True, help="Skip confirmation prompt")
@click.option("--db-path", type=click.Path(), default=None,
              help="Custom database path")
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
