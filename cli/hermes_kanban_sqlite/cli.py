"""
CLI entry point for hermes-kanban-sqlite.

Commands:
  init <project>                       Initialize a new board
  list [--board <name>] [--column <col>]  List cards
  add <title> [--board <name>] [--tag <tag>...] [--column <col>] [--due <date>]
  move <card_id> <column>
  info <card_id>
  comment <card_id> <text>
  dependency <blocks_id> <blocked_id>
  archive <card_id>
  tui [--board <name>]
  sync [--board <name>] [--vault-dir <path>]
  demo [--project <name>] [--board <name>]
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
    get_board_stats,
)
from .tui import run_tui
from .sync import sync_to_obsidian

DEFAULT_DB_DIR = Path.home() / ".hermes"
DEFAULT_DB_PATH = DEFAULT_DB_DIR / "kanban.db"

def _get_db_path() -> str:
    DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
    return str(DEFAULT_DB_PATH)

def _resolve_board_id(db_path: str, board: str | int | None) -> int:
    boards = list_boards(db_path)
    if not boards:
        raise KanbanError("No boards exist. Run 'init <project>' first.")
    if board is None:
        return boards[0]["id"]
    try:
        bid = int(board)
        for b in boards:
            if b["id"] == bid:
                return bid
        raise KanbanError(f"Board ID {bid} not found")
    except (ValueError, TypeError):
        for b in boards:
            if b["name"] == board:
                return b["id"]
        raise KanbanError(f"Board '{board}' not found. Available: {[b['name'] for b in boards]}")

# ---------- init ----------
@click.command()
@click.argument("project_name")
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def init(project_name, db_path):
    if db_path is None:
        db_path = _get_db_path()
    init_schema(db_path)
    click.echo("Schema initialized")
    try:
        board_id = create_board(db_path, project_name, f"Project: {project_name}")
        conn = get_connection(db_path)
        cursor = conn.cursor()
        for name, desc, color, order in STANDARD_COLUMNS:
            cursor.execute("INSERT OR IGNORE INTO columns (name, description, color, sort_order) VALUES (?, ?, ?, ?)", (name, desc, color.lower(), order))
        conn.commit()
        click.echo(f"Board created: {project_name} (id={board_id})")
        click.echo(f"Database: {db_path}")
        click.echo("Next: hermes-kanban-sqlite add <title>")
    except KanbanError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ---------- list ----------
@click.command()
@click.option("--board", default=None, help="Board name or ID")
@click.option("--column", default=None, help="Filter by column")
@click.option("--archived", is_flag=True, help="Include archived")
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def list_cards_cmd(board, column, archived, db_path):
    if db_path is None:
        db_path = _get_db_path()
    try:
        bid = _resolve_board_id(db_path, board)
        status = None if archived else "active"
        cards = list_cards(db_path, board_id=bid, column_name=column, status=status)
        if not cards:
            click.echo("No cards found.")
            return
        for c in cards:
            tags = ", ".join(t["name"] for t in c.get("tags", []))
            blocked = "[-]" if c.get("is_blocked") else "[ ]"
            click.echo(f"  [{c['id']}] {blocked} {c['title']}  [{c['column_name']}]  {tags}")
        click.echo(f"Total: {len(cards)} card(s)")
    except KanbanError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ---------- add ----------
@click.command()
@click.argument("title")
@click.option("--board", default=None, help="Board name or ID")
@click.option("--tag", multiple=True, help="Tag(s)")
@click.option("--column", default=None, help="Column (default: To Do)")
@click.option("--due", default=None, help="Due date")
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def add(title, board, tag, column, due, db_path):
    if db_path is None:
        db_path = _get_db_path()
    try:
        bid = _resolve_board_id(db_path, board)
        col = column or "To Do"
        desc = f"📅 Due: {due}" if due else ""
        cid = create_card(db_path, bid, title=title, column_name=col, description=desc, tags=list(tag) if tag else None)
        click.echo(f"Card created: [{cid}] {title} in column {col}")
    except KanbanError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ---------- move ----------
@click.command()
@click.argument("card_id", type=int)
@click.argument("target_column")
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def move(card_id, target_column, db_path):
    if db_path is None:
        db_path = _get_db_path()
    try:
        card = get_card(db_path, card_id)
        if not card:
            click.echo(f"Card {card_id} not found.", err=True)
            raise SystemExit(1)
        board_id = card.get("board_id")
        ok = update_card(db_path, card_id, board_id, column_name=target_column)
        if ok:
            click.echo(f"Card {card_id} moved to {target_column}")
        else:
            click.echo(f"No change or card not found.", err=True)
            raise SystemExit(1)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ---------- info ----------
@click.command()
@click.argument("card_id", type=int)
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def info(card_id, db_path):
    if db_path is None:
        db_path = _get_db_path()
    card = get_card(db_path, card_id)
    if not card:
        click.echo(f"Card {card_id} not found.", err=True)
        raise SystemExit(1)
    click.echo(f"  [{card['id']}] {card['title']}")
    click.echo(f"  Column: {card['column_name']}  Status: {card['status']}")
    click.echo(f"  Desc  : {card.get('description','(none)')}")
    tags = ", ".join(t["name"] for t in card.get("tags", []))
    click.echo(f"  Tags  : {tags or '(none)'}")
    deps = get_dependencies(db_path, card_id)
    if deps["blockers"]:
        click.echo(f"  Blocked by: {[c['id'] for c in deps['blockers']]}")
    if deps["blocked_by"]:
        click.echo(f"  Blocks    : {[c['id'] for c in deps['blocked_by']]}")
    click.echo(f"  Created: {card.get('created_at')}  Updated: {card.get('updated_at')}")
    for c in card.get("comments", []):
        click.echo(f"  [{c['created_at']}] {c['author']}: {c['content']}")

# ---------- comment ----------
@click.command()
@click.argument("card_id", type=int)
@click.argument("text")
@click.option("--author", default="CLI User", help="Author name")
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def comment(card_id, text, author, db_path):
    if db_path is None:
        db_path = _get_db_path()
    try:
        cid = add_comment(db_path, card_id, author, text)
        click.echo(f"Comment added: [{cid}] to card {card_id}")
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ---------- dependency ----------
@click.command()
@click.argument("blocks_id", type=int)
@click.argument("blocked_id", type=int)
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def dependency(blocks_id, blocked_id, db_path):
    if db_path is None:
        db_path = _get_db_path()
    try:
        did = add_dependency(db_path, blocks_id, blocked_id)
        click.echo(f"Dependency created: {blocks_id} blocks {blocked_id}")
    except KanbanError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ---------- archive ----------
@click.command()
@click.argument("card_id", type=int)
@click.option("--yes", is_flag=True, help="Skip confirmation")
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def archive(card_id, yes, db_path):
    if db_path is None:
        db_path = _get_db_path()
    card = get_card(db_path, card_id)
    if not card:
        click.echo(f"Card {card_id} not found.", err=True)
        return
    if not yes:
        click.confirm(f"Archive card [{card_id}] '{card['title']}'?", abort=True)
    try:
        ok = archive_card(db_path, card_id)
        if ok:
            click.echo(f"Card {card_id} archived.")
        else:
            click.echo(f"Failed to archive card {card_id}.", err=True)
            raise SystemExit(1)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ---------- tui ----------
@click.command()
@click.option("--board", default=None, help="Board name or ID")
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def tui(board, db_path):
    if db_path is None:
        db_path = _get_db_path()
    if not Path(db_path).exists():
        click.echo(f"No database at {db_path}", err=True)
        raise SystemExit(1)
    try:
        bid = _resolve_board_id(db_path, board)
    except KanbanError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)
    click.echo(f"Launching TUI — board {bid}")
    run_tui(db_path, board_id=bid)

# ---------- sync ----------
@click.command()
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
@click.option("--vault-dir", type=click.Path(), default="/mnt/nas/Obsidian Vault/Kanban", help="Obsidian vault Kanban directory")
@click.option("--board", default=None, help="Board name to sync")
def sync(db_path, vault_dir, board):
    if db_path is None:
        db_path = _get_db_path()
    if not Path(db_path).exists():
        click.echo(f"No database at {db_path}", err=True)
        raise SystemExit(1)
    click.echo("Syncing SQLite → Obsidian...")
    result = sync_to_obsidian(db_path, vault_dir, board)
    if result["errors"]:
        for err in result["errors"]:
            click.echo(f"  Warning: {err}", err=True)
    click.echo(f"Synced {result['cards_synced']} cards across {result['columns_synced']} columns")
    click.echo(f"Board file: {result['board_file']}")

# ---------- demo ----------
@click.command()
@click.option("--project", default="Hermes Demo", help="Project name for demo board")
@click.option("--board", default=None, help="Board name")
@click.option("--db-path", type=click.Path(), default=None, help="Custom database path")
def demo(project, board, db_path):
    if db_path is None:
        db_path = _get_db_path()
    try:
        boards = list_boards(db_path)
        conn = get_connection(db_path)
        cursor = conn.cursor()
        standard_col_names = [name for name, _, _, _ in STANDARD_COLUMNS]
        missing_cols = [name for name in standard_col_names if name not in get_all_columns(db_path)]
        if not boards:
            click.echo("Creating demo board...")
            cursor.execute("INSERT INTO boards (name, description) VALUES (?, ?)", (board or project, "Demo board seeded by hermes-kanban-sqlite demo"))
            conn.commit()
            cursor.execute("SELECT last_insert_rowid()")
            row = cursor.fetchone()
            board_id = row[0] if row else 1
        else:
            if board:
                board_id = _resolve_board_id(db_path, board)
            else:
                board_id = boards[0]["id"]
        if missing_cols:
            click.echo(f"Ensuring columns: {', '.join(missing_cols)}")
            for name, desc, color, order in STANDARD_COLUMNS:
                try:
                    cursor.execute("INSERT OR IGNORE INTO columns (name, description, color, sort_order) VALUES (?, ?, ?, ?)", (name, desc, color.lower(), order))
                except sqlite3.IntegrityError:
                    pass
        else:
            click.echo("Standard columns already exist")
        conn.commit()
        demo_cards = [
            {"title":"Design sync schema","column":"Backlog","description":"Create database schema for bidirectional sync between SQLite and external Kanban instances.","tags":["backend","devops"],"due_date":"2026-05-13"},
            {"title":"Investigate DB lock contention","column":"Backlog","description":"Profile SQLite connection pool and identify deadlock scenarios under concurrent TUI access.","tags":["backend","devops"],"due_date":"2026-05-18"},
            {"title":"Create board templates API","column":"Backlog","description":"Build REST endpoints to create pre-configured Kanban boards with columns and default cards.","tags":["backend","devops"]},
            {"title":"Fix TUI column layout","column":"To Do","description":"Adjust column widths so 'Blocked' and 'Done' fit properly in the Textual render.","tags":["frontend","ui/ux"],"due_date":"2026-05-08"},
            {"title":"Add auto-refresh to TUI","column":"To Do","description":"Implement polling for new cards/columns without requiring manual redraw trigger.","tags":["frontend","devops"],"due_date":"2026-05-15"},
            {"title":"Write sync bridge tests","column":"To Do","description":"Add pytest coverage for the sync_to_obsidian function with edge cases.","tags":["frontend","qa"],"due_date":"2026-05-10"},
            {"title":"Document CLI commands","column":"To Do","description":"Expand README with examples for add, move, info, and dependency subcommands.","tags":["docs","qa"],"due_date":"2026-05-12"},
            {"title":"Review PR #7 feedback","column":"In Progress","description":"Address code review comments around database connection pooling in kanban.py.","tags":["frontend","backend"],"due_date":"2026-05-09"},
            {"title":"Benchmark SQLite performance","column":"In Progress","description":"Run load tests with 100+ cards across columns to identify scaling bottlenecks.","tags":["backend","devops"],"due_date":"2026-05-20"},
            {"title":"Implement GitHub Issues import","column":"In Progress","description":"Create parser to extract issue data from GitHub API and create Kanban cards.","tags":["backend","devops"],"due_date":"2026-05-14"},
            {"title":"Update CI/CD pipeline","column":"In Progress","description":"Add automated deployment workflow for hermes-kanban-sqlite releases.","tags":["devops","backend"],"due_date":"2026-05-19"},
            {"title":"Deploy to Cloudflare","column":"Review","description":"Set up Cloudflare Pages deployment for web-based Kanban demo.","tags":["devops","frontend"],"due_date":"2026-05-11"},
            {"title":"Blocked: API gateway routing","column":"Blocked","description":"Configure Cloudflare Workers to route Kanban webhook events.","tags":["devops","backend"]},
        ]
        demo_titles = [c["title"] for c in demo_cards]
        if demo_titles:
            placeholders = ",".join("?" for _ in demo_titles)
            cursor.execute(f"DELETE FROM dependencies WHERE blocker_card_id IN (SELECT id FROM cards WHERE title IN ({placeholders})) OR blocked_by_card_id IN (SELECT id FROM cards WHERE title IN ({placeholders}))", demo_titles + demo_titles)
            cursor.execute(f"DELETE FROM cards WHERE title IN ({placeholders})", demo_titles)
            conn.commit()
        tags_set = set()
        comments_count = 0
        dependency_created = False
        created_cards = {}
        for card_data in demo_cards:
            tag_list = [t.strip() for t in card_data.get("tags", []) if t.strip()] if card_data.get("tags") else None
            due_date = card_data.get("due_date")
            desc = (card_data.get("description", "") + f"\n   📅 Due: {due_date}") if due_date else card_data.get("description", "")
            for tag in tag_list or []:
                tags_set.add(tag)
            card_id_val = create_card(db_path, board_id, title=card_data["title"], column_name=card_data["column"], description=desc, tags=tag_list or None)
            created_cards[card_data["title"]] = card_id_val
            if card_data["column"] == "To Do" and card_data["title"] in ["Fix TUI column layout", "Document CLI commands"]:
                add_comment(db_path, card_id_val, "Demo Bot", f"TODO: Address this during demo. Priority: {card_data.get('due_date','N/A')}")
                comments_count += 1
        review_pr_id = created_cards.get("Review PR #7 feedback")
        github_issues_id = created_cards.get("Implement GitHub Issues import")
        if review_pr_id and github_issues_id:
            add_dependency(db_path, review_pr_id, github_issues_id)
            dependency_created = True
            click.echo(f"  Dependency created: {review_pr_id} blocks {github_issues_id}")
        click.echo("\n" + "="*60)
        click.echo(click.style("Demo board seeded!", fg="bright_green", bold=True))
        click.echo(f"  Columns: {len(standard_col_names)} ({', '.join(standard_col_names)})")
        click.echo(f"  Cards: {len(demo_cards)} distributed")
        click.echo(f"  Tags: {sorted(tags_set) if tags_set else 'none'}")
        click.echo(f"  Comments: {comments_count}")
        click.echo(f"  Dependencies: {'Yes' if dependency_created else 'No'}")
        click.echo("="*60 + "\n")
    except KanbanError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

# ---------- main ----------
@click.group(invoke_without_command=True)
@click.pass_context
def cli(ctx):
    if ctx.invoked_subcommand is None:
        db_path = _get_db_path()
        if Path(db_path).exists():
            click.echo(f"Kanban database: {db_path}")
            boards = list_boards(db_path)
            if boards:
                click.echo(f"\n{len(boards)} board(s):")
                for b in boards:
                    click.echo(f"  [{b['id']}] {b['name']}")
            else:
                click.echo("No boards — run init.")
        else:
            click.echo("No database — run init <project>")

cli.add_command(init)
cli.add_command(list_cards_cmd, name="list")
cli.add_command(add)
cli.add_command(move)
cli.add_command(info)
cli.add_command(comment)
cli.add_command(dependency)
cli.add_command(archive)
cli.add_command(tui)
cli.add_command(sync)
cli.add_command(demo)

def main():
    cli()

if __name__ == "__main__":
    main()

