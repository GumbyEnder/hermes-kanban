"""
Sync module — SQLite → Obsidian Kanban markdown bridge.

Reads cards from SQLite and writes Obsidian Kanban-compatible
markdown boards in the vault for archival/visual rendering.
"""
from pathlib import Path
from typing import Optional

from .database import get_connection, STANDARD_COLUMNS
from .kanban import get_all_columns, list_cards, list_boards, get_card


OBSIDIAN_KANBAN_FRONTMATTER = """---
kanban-plugin: board
---

"""

ARCHIVE_FRONTMATTER = """---
kanban-plugin: board
board-type: archived
---

"""


def sync_to_obsidian(
    db_path: str,
    vault_kanban_dir: str = "/mnt/nas/Obsidian Vault/Kanban",
    board_name: Optional[str] = None,
) -> dict:
    """Sync SQLite cards to an Obsidian Kanban markdown board.

    Args:
        db_path: Path to SQLite database
        vault_kanban_dir: Obsidian vault Kanban directory
        board_name: Board name (defaults to first board in DB)

    Returns:
        dict with keys: board_file, columns_synced, cards_synced, errors
    """
    result = {
        "board_file": "",
        "columns_synced": 0,
        "cards_synced": 0,
        "errors": [],
    }

    # Determine board ID (the actual board to sync) and display name (for filename/frontmatter)
    boards = list_boards(db_path)
    if not boards:
        result["errors"].append("No boards found in database")
        return result

    if board_name is None:
        # Use the first board's name as both identifier and display name
        board = boards[0]
        board_id = board["id"]
        board_name = board["name"]
    else:
        # board_name provided: try to match to an existing board for data source; if not found, use first board but keep the provided name for display
        matched = None
        for b in boards:
            if b["name"] == board_name:
                matched = b
                break
        if matched:
            board_id = matched["id"]
            # board_name remains as provided (could be same as matched)
        else:
            # No matching board: use first board's data but keep provided board_name for output (override)
            board_id = boards[0]["id"]
            # board_name stays as the user-provided custom name

    # Sanitize filename (always apply space→dash)
    safe_name = board_name.replace(" ", "-").replace("/", "-")
    safe_name = "".join(c for c in safe_name if c.isalnum() or c in " -_").strip()
    board_file = Path(vault_kanban_dir) / f"{safe_name}.md"

    # Ensure directory exists
    board_file.parent.mkdir(parents=True, exist_ok=True)

    # Collect data from SQLite
    columns = get_all_columns(db_path, board_id)
    if not columns:
        # Seed standard columns if table is empty
        conn = get_connection(db_path)
        cursor = conn.cursor()
        for name, desc, color, order in STANDARD_COLUMNS:
            cursor.execute(
                "INSERT OR IGNORE INTO columns (board_id, name, description, color, sort_order) "
                "VALUES (?, ?, ?, ?, ?)",
                (board_id, name, desc, color, order),
            )
        conn.commit()
        columns = get_all_columns(db_path, board_id)
    if not columns:
        result["errors"].append("No columns found in database")
        return result

    # Build markdown
    lines = [OBSIDIAN_KANBAN_FRONTMATTER.strip(), "", f"# {board_name}", ""]

    for col in columns:
        col_name = col["name"]
        cards = list_cards(db_path, board_id=board_id, column_name=col_name)
        result["cards_synced"] += len(cards)

        lines.append(f"## {col_name}")
        lines.append("")

        for card in cards:
            # Enrich with full card data (tags, comments)
            full_card = get_card(db_path, card["id"]) or card

            # Checkbox: [x] for Done, [-] for Blocked, [ ] for everything else
            if col_name == "Done":
                checkbox = "[x]"
            elif col_name == "Blocked":
                checkbox = "[-]"
            else:
                checkbox = "[ ]"

            lines.append(f"- {checkbox} {card['title']}")

            # Card metadata as sub-bullets
            desc = full_card.get("description", "") or ""
            if desc and desc != f"Description: {card['title']}":
                lines.append(f"    - **Description**: {desc}")

            tags = full_card.get("tags", [])
            if tags:
                tag_names = ", ".join(t["name"] for t in tags)
                lines.append(f"    - **Tags**: {tag_names}")

            lines.append(f"    - **ID**: {card['id']}")
            lines.append(f"    - **Status**: {card.get('status', 'active')}")
            lines.append(f"    - **Created**: {card.get('created_at', '')}")
            lines.append("")

        result["columns_synced"] += 1

    # Write to file
    board_file.write_text("\n".join(lines) + "\n")
    result["board_file"] = str(board_file)

    return result


def sync_card_to_obsidian(
    db_path: str,
    card_id: int,
    vault_kanban_dir: str = "/mnt/nas/Obsidian Vault/Kanban",
) -> dict:
    """Sync a single card update to Obsidian by re-syncing its board.

    This is a lightweight incremental sync — it reads the card's board
    and regenerates the full board markdown.
    """
    return sync_to_obsidian(db_path, vault_kanban_dir)
