"""
Sync module — SQLite ↔ Obsidian Kanban bridge (bidirectional with conflict detection).

Features:
- push: SQLite → Obsidian (write markdown boards)
- pull: Obsidian → SQLite (import card edits)
- conflict detection via file mtime + sync_metadata table
- dry-run, force, auto-daemon (polling)
"""

import hashlib
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any
from threading import Event, Thread

from .database import get_connection, record_usage_event
from .kanban import (
    create_card,
    update_card,
    get_card,
    list_cards,
    list_boards,
    get_all_columns,
    create_column,
    STANDARD_COLUMNS,
)
from .usage import get_board_spend


# Obsidian markdown format constants
OBSIDIAN_FRONTMATTER = "---\nkanban-plugin: board\n---\n\n"

# Regex patterns
COLUMN_HEADING_RE = re.compile(r'^##\s+(.+)$')
CARD_ITEM_RE = re.compile(r'^\s*-\s+\[(.)\]\s+(.+)$')
META_FIELD_RE = re.compile(r'^\s+-\s+\*\*([^:]+)\*\*:\s+(.+)$')

ID_FIELD = 'ID'
STATUS_FIELD = 'Status'
CREATED_FIELD = 'Created'
UPDATED_FIELD = 'Updated'
TAGS_FIELD = 'Tags'
DESCRIPTION_FIELD = 'Description'


def _compute_file_hash(path: Path) -> str:
    """SHA256 hash of file contents."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _get_board_file(vault_kanban_dir: str, board_name: str) -> Path:
    safe_name = board_name.replace(" ", "-").replace("/", "-")
    safe_name = "".join(c for c in safe_name if c.isalnum() or c in " -_").strip()
    return Path(vault_kanban_dir) / f"{safe_name}.md"


def _load_sync_meta(db_path: str, board_id: int) -> Dict[str, Any]:
    """Return sync_metadata row for board, or empty dict if none."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sync_metadata WHERE board_id = ?", [board_id])
    row = cursor.fetchone()
    return dict(row) if row else {}


def _upsert_sync_meta(db_path: str, board_id: int, **kwargs) -> None:
    """Create or update sync_metadata for board."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM sync_metadata WHERE board_id = ?", [board_id])
    exists = cursor.fetchone() is not None
    if exists:
        fields = ", ".join(f"{k} = ?" for k in kwargs.keys())
        values = list(kwargs.values()) + [board_id]
        cursor.execute(f"UPDATE sync_metadata SET {fields} WHERE board_id = ?", values)
    else:
        columns = ["board_id"] + list(kwargs.keys())
        placeholders = ", ".join("?" for _ in columns)
        values = [board_id] + list(kwargs.values())
        cursor.execute(
            f"INSERT INTO sync_metadata ({', '.join(columns)}) VALUES ({placeholders})",
            values
        )
    conn.commit()


def detect_conflicts(
    db_path: str,
    board_id: int,
    vault_kanban_dir: str,
    board_name: str,
) -> Dict[str, Any]:
    """Check if Obsidian board file has been edited since last push."""
    board_file = _get_board_file(vault_kanban_dir, board_name)
    meta = _load_sync_meta(db_path, board_id)
    last_mtime = meta.get("last_file_mtime")
    if not board_file.exists():
        return {"conflict": False, "reason": "no_obsidian_file"}
    current_mtime = board_file.stat().st_mtime
    if last_mtime is None:
        return {"conflict": False, "reason": "first_push"}
    if current_mtime > last_mtime:
        return {
            "conflict": True,
            "reason": "file_modified_since_last_push",
            "file_mtime": current_mtime,
            "last_pushed_mtime": last_mtime,
        }
    return {"conflict": False, "reason": "up_to_date", "file_mtime": current_mtime, "last_pushed_mtime": last_mtime}


def sync_to_obsidian(
    db_path: str,
    vault_kanban_dir: str = "/mnt/nas/Obsidian Vault/Kanban",
    board_name: Optional[str] = None,
    dry_run: bool = False,
    force: bool = False,
) -> Dict[str, Any]:
    """Push SQLite Kanban board to Obsidian markdown."""
    result = {
        "board_file": "",
        "columns_synced": 0,
        "cards_synced": 0,
        "conflicts": 0,
        "warnings": [],
        "errors": [],
        "dry_run": dry_run,
    }

    boards = list_boards(db_path)
    if not boards:
        result["errors"].append("No boards found in database")
        return result
    if board_name is None:
        board = boards[0]
        board_id = board["id"]
        board_name = board["name"]
    else:
        matched = next((b for b in boards if b["name"] == board_name), None)
        if matched:
            board_id = matched["id"]
        else:
            board_id = boards[0]["id"]

    board_file = _get_board_file(vault_kanban_dir, board_name)
    board_file.parent.mkdir(parents=True, exist_ok=True)

    # Conflict detection
    conflict_info = detect_conflicts(db_path, board_id, vault_kanban_dir, board_name)
    if conflict_info["conflict"]:
        result["conflicts"] = 1
        result["warnings"].append(
            f"Conflict: Obsidian board file modified since last push "
            f"(file mtime {datetime.fromtimestamp(conflict_info['file_mtime']).isoformat()} "
            f"vs last push {datetime.fromtimestamp(conflict_info['last_pushed_mtime']).isoformat()})"
        )
        if not force:
            result["errors"].append("Use --force to overwrite Obsidian changes")
            return result
        else:
            result["warnings"].append("--force: overwriting Obsidian changes")

    # Collect columns & cards
    columns = get_all_columns(db_path, board_id)
    if not columns:
        conn = get_connection(db_path)
        cur = conn.cursor()
        for name, desc, color, order in STANDARD_COLUMNS:
            cur.execute(
                "INSERT OR IGNORE INTO columns (board_id, name, description, color, sort_order) VALUES (?, ?, ?, ?, ?)",
                (board_id, name, desc, color, order),
            )
        conn.commit()
        columns = get_all_columns(db_path, board_id)
    if not columns:
        result["errors"].append("No columns found in database")
        return result

    # Build markdown lines
    lines = [OBSIDIAN_FRONTMATTER.strip(), "", f"# {board_name}", ""]

    for col in columns:
        col_name = col["name"]
        cards = list_cards(db_path, board_id=board_id, column_name=col_name)
        result["cards_synced"] += len(cards)
        lines.append(f"## {col_name}")
        lines.append("")
        for card in cards:
            full = get_card(db_path, card["id"]) or card
            tags = full.get("tags", [])
            tag_names = ", ".join(t["name"] for t in tags) if tags else ""
            checkbox = "[x]" if col_name == "Done" else ("[-]" if col_name == "Blocked" else "[ ]")
            lines.append(f"- {checkbox} {card['title']}")
            desc = full.get("description", "") or ""
            if desc and desc != f"Description: {card['title']}":
                lines.append(f"    - **{DESCRIPTION_FIELD}**: {desc}")
            if tag_names:
                lines.append(f"    - **{TAGS_FIELD}**: {tag_names}")
            lines.append(f"    - **{ID_FIELD}**: {card['id']}")
            lines.append(f"    - **{STATUS_FIELD}**: {card.get('status', 'active')}")
            lines.append(f"    - **{CREATED_FIELD}**: {card.get('created_at', '')}")
            updated = card.get("updated_at") or datetime.utcnow().isoformat()
            lines.append(f"    - **{UPDATED_FIELD}**: {updated}")
            lines.append("")
        result["columns_synced"] += 1

    content = "\n".join(lines) + "\n"

    if dry_run:
        result["warnings"].append("dry-run: no file written")
        result["would_write"] = {
            "size_bytes": len(content),
            "hash": hashlib.sha256(content.encode()).hexdigest()[:12],
        }
        return result

    # Write file
    try:
        board_file.write_text(content)
        result["board_file"] = str(board_file)
    except Exception as e:
        result["errors"].append(f"Failed to write board file: {e}")
        return result

    # Update sync_metadata
    meta = _load_sync_meta(db_path, board_id)
    try:
        mtime = board_file.stat().st_mtime
        file_hash = _compute_file_hash(board_file)
        _upsert_sync_meta(
            db_path,
            board_id,
            last_sqlite_sync=datetime.utcnow().isoformat(),
            last_file_mtime=mtime,
            file_hash=file_hash,
            version=(meta.get("version", 0) + 1) if meta else 1,
        )
    except Exception as e:
        result["warnings"].append(f"Failed to update sync_metadata: {e}")

    return result


def _parse_board_markdown(content: str) -> Dict[str, Any]:
    """Parse Obsidian board markdown into structured dict."""
    lines = content.split('\n')
    columns = []
    current_col = None
    current_card = None

    for line in lines:
        m = COLUMN_HEADING_RE.match(line)
        if m:
            if current_col:
                columns.append(current_col)
            current_col = {"name": m.group(1).strip(), "cards": []}
            continue
        m2 = CARD_ITEM_RE.match(line)
        if m2:
            if current_card:
                current_col["cards"].append(current_card)
            current_card = {
                "title": m2.group(2).strip(),
                "checkbox": m2.group(1),
                "meta": {},
            }
            continue
        if current_card and line.strip().startswith('- **'):
            m3 = META_FIELD_RE.match(line)
            if m3:
                key = m3.group(1).strip()
                val = m3.group(2).strip()
                current_card["meta"][key] = val
                continue

    if current_card and current_col:
        current_col["cards"].append(current_card)
    if current_col:
        columns.append(current_col)

    return {"columns": columns}


def sync_from_obsidian(
    db_path: str,
    vault_kanban_dir: str = "/mnt/nas/Obsidian Vault/Kanban",
    board_name: Optional[str] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Pull card changes from Obsidian markdown into SQLite."""
    result = {
        "cards_created": 0,
        "cards_updated": 0,
        "conflicts_skipped": 0,
        "warnings": [],
        "errors": [],
    }

    boards = list_boards(db_path)
    if not boards:
        result["errors"].append("No boards in DB")
        return result
    if board_name is None:
        board_id = boards[0]["id"]
        board_name_display = boards[0]["name"]
    else:
        matched = next((b for b in boards if b["name"] == board_name), None)
        if matched:
            board_id = matched["id"]
            board_name_display = board_name
        else:
            result["errors"].append(f"Board '{board_name}' not found")
            return result

    board_file = _get_board_file(vault_kanban_dir, board_name_display)
    if not board_file.exists():
        result["errors"].append(f"Obsidian board file not found: {board_file}")
        return result

    content = board_file.read_text()
    parsed = _parse_board_markdown(content)

    conn = get_connection(db_path)
    cur = conn.cursor()
    # Build map of existing column name -> id for this board
    columns_db = {c["name"]: c["id"] for c in get_all_columns(db_path, board_id)}
    for col in parsed["columns"]:
        col_name = col["name"]
        if col_name not in columns_db:
            # Check if column exists for this board; if not create
            cur.execute("SELECT id FROM columns WHERE board_id = ? AND name = ?", (board_id, col_name))
            row = cur.fetchone()
            if row:
                column_id = row["id"]
            else:
                column_id = cur.execute(
                    "INSERT INTO columns (board_id, name, description, color, sort_order) VALUES (?, ?, ?, ?, ?)",
                    (board_id, col_name, f"Column: {col_name}", "#6c757d", 0)
                ).lastrowid
                conn.commit()
            columns_db[col_name] = column_id
            result["warnings"].append(f"Created missing column '{col_name}'")

    now_ts = datetime.utcnow().isoformat()

    for col in parsed["columns"]:
        col_name = col["name"]
        for card in col["cards"]:
            meta = card["meta"]
            card_id_str = meta.get('ID')
            card_id = int(card_id_str) if card_id_str and card_id_str.isdigit() else None
            title = card["title"]
            description = meta.get(DESCRIPTION_FIELD, "")
            tags_str = meta.get(TAGS_FIELD, "")
            tags = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else []
            status = meta.get(STATUS_FIELD, "active")
            created_at = meta.get(CREATED_FIELD, now_ts)
            updated_at = meta.get(UPDATED_FIELD, now_ts)

            if card_id is not None:
                existing = get_card(db_path, card_id)
                if existing:
                    try:
                        db_dt = datetime.fromisoformat(existing.get("updated_at") or created_at)
                        obs_dt = datetime.fromisoformat(updated_at)
                    except ValueError:
                        db_dt = datetime.max
                        obs_dt = datetime.min
                    if db_dt > obs_dt:
                        result["conflicts_skipped"] += 1
                        result["warnings"].append(
                            f"Card ID {card_id} '{title}' has newer DB changes; skipping import"
                        )
                        continue
                    if dry_run:
                        result["warnings"].append(
                            f"[dry-run] Would update card ID {card_id}: '{title}'"
                        )
                        result["cards_updated"] += 1
                        continue
                    cur = conn.cursor()
                    update_fields = ["title = ?", "description = ?", "column_name = ?", "status = ?", "updated_at = ?"]
                    params = [title, description or title, col_name, status, updated_at, card_id]
                    cur.execute(
                        f"UPDATE cards SET {', '.join(update_fields)} WHERE id = ?",
                        params
                    )
                    # Replace tags
                    cur.execute("DELETE FROM card_tags WHERE card_id = ?", [card_id])
                    for t in tags:
                        cur.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", [t])
                        cur.execute("SELECT id FROM tags WHERE name = ?", [t])
                        tid_row = cur.fetchone()
                        if tid_row:
                            tid = tid_row["id"]
                            cur.execute("INSERT INTO card_tags (card_id, tag_id) VALUES (?, ?)", [card_id, tid])
                    conn.commit()
                    result["cards_updated"] += 1
                else:
                    result["warnings"].append(
                        f"Card ID {card_id} references non-existent DB card; creating anew."
                    )
                    card_id = None
            if card_id is None:
                if dry_run:
                    result["warnings"].append(
                        f"[dry-run] Would create card: '{title}' in column '{col_name}'"
                    )
                    result["cards_created"] += 1
                    continue
                try:
                    new_id = create_card(
                        db_path,
                        board_id=board_id,
                        title=title,
                        column_name=col_name,
                        description=description,
                        tags=tags,
                    )
                    result["cards_created"] += 1
                except Exception as e:
                    result["errors"].append(f"Failed to create card '{title}': {e}")

    if not dry_run:
        try:
            _upsert_sync_meta(
                db_path,
                board_id,
                last_obsidian_sync=datetime.utcnow().isoformat(),
            )
        except Exception as e:
            result["warnings"].append(f"Failed to update sync_metadata (pull): {e}")

    return result
def sync_daemon(
    db_path: str,
    vault_kanban_dir: str,
    board_name: Optional[str] = None,
    interval_minutes: int = 5,
    stop_event: Optional[Event] = None,
) -> None:
    """Background loop: bidirectional sync every interval_minutes."""
    if stop_event is None:
        stop_event = Event()
    while not stop_event.is_set():
        push = sync_to_obsidian(db_path, vault_kanban_dir, board_name, dry_run=False, force=False)
        pull = sync_from_obsidian(db_path, vault_kanban_dir, board_name, dry_run=False)
        time.sleep(interval_minutes * 60)

