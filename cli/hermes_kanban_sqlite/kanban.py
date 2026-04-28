"""
Kanban logic module — CRUD for boards, columns, cards, tags, dependencies, comments.

All card operations are board-scoped via board_id. Column definitions are
global (shared across all boards).
"""
from pathlib import Path
from typing import List, Optional
import sqlite3
from .database import init_schema, get_connection, reset_connection, STANDARD_COLUMNS

class KanbanError(Exception):
    """Base exception for kanban operations."""
    pass

def create_board(db_path: str, name: str, description: str = "") -> int:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM boards WHERE name = ?", (name,))
    if cursor.fetchone():
        raise KanbanError(f"Board '{name}' already exists")
    cursor.execute("INSERT INTO boards (name, description) VALUES (?, ?)", (name, description or f"Kanban board: {name}"))
    conn.commit()
    return cursor.lastrowid

def get_board(db_path: str, board_id: int) -> Optional[dict]:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM boards WHERE id = ?", (board_id,))
    row = cursor.fetchone()
    return dict(row) if row else None

def list_boards(db_path: str) -> List[dict]:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM boards ORDER BY name")
    return [dict(row) for row in cursor.fetchall()]

def create_column(db_path: str, name: str, description: str = "", color: str = "#6c757d", sort_order: int = 0) -> int:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM columns WHERE name = ?", (name,))
    if cursor.fetchone():
        raise KanbanError(f"Column '{name}' already exists")
    cursor.execute("INSERT INTO columns (name, description, color, sort_order) VALUES (?, ?, ?, ?)", (name, description or f"Column: {name}", color.lower(), sort_order))
    conn.commit()
    return cursor.lastrowid

def get_columns(db_path: str) -> List[dict]:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM columns ORDER BY sort_order")
    return [dict(row) for row in cursor.fetchall()]

def get_all_columns(db_path: str) -> List[dict]:
    return get_columns(db_path)

def create_card(db_path: str, board_id: int, title: str, column_name: str, description: str = "", tags: List[str] = None) -> int:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM cards WHERE board_id = ? AND title = ? AND status != 'deleted'", (board_id, title))
    if cursor.fetchone():
        raise KanbanError(f"Card '{title}' already exists on this board")
    card_id = cursor.execute("INSERT INTO cards (board_id, title, description, column_name) VALUES (?, ?, ?, ?)", (board_id, title, description or f"Description: {title}", column_name)).lastrowid
    if tags:
        for tag_name in tags:
            cursor.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
            row = cursor.fetchone()
            tag_id = row[0] if row else cursor.execute("INSERT INTO tags (name) VALUES (?)", (tag_name,)).lastrowid
            cursor.execute("INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)", (card_id, tag_id))
    conn.commit()
    return card_id

def get_card(db_path: str, card_id: int) -> Optional[dict]:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cards WHERE id = ? AND status != 'deleted'", (card_id,))
    row = cursor.fetchone()
    if not row:
        return None
    cursor.execute("SELECT t.name, t.description, t.color FROM tags t JOIN card_tags ct ON t.id = ct.tag_id WHERE ct.card_id = ?", (card_id,))
    tags = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT author, content, created_at FROM comments WHERE card_id = ? ORDER BY created_at", (card_id,))
    comments = [dict(r) for r in cursor.fetchall()]
    return {**dict(row), "tags": tags, "comments": comments}

def list_cards(db_path: str, board_id: Optional[int] = None, column_name: Optional[str] = None, status: Optional[str] = None) -> List[dict]:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    query = "SELECT * FROM cards WHERE status NOT IN ('deleted', 'archived')"
    params = []
    if board_id is not None:
        query += " AND board_id = ?"
        params.append(board_id)
    if column_name is not None:
        query += " AND column_name = ?"
        params.append(column_name)
    if status is not None:
        query += " AND status = ?"
        params.append(status)
    cursor.execute(query, params)
    return [dict(row) for row in cursor.fetchall()]

def update_card(db_path: str, card_id: int, board_id: int, title: Optional[str] = None, description: Optional[str] = None, column_name: Optional[str] = None) -> bool:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM cards WHERE id = ? AND board_id = ?", (card_id, board_id))
    if not cursor.fetchone():
        raise KanbanError(f"Card {card_id} not found on board {board_id}")
    update_fields = []
    params = []
    if title is not None:
        cursor.execute("SELECT id FROM cards WHERE board_id = ? AND title = ? AND id != ? AND status != 'deleted'", (board_id, title, card_id))
        if cursor.fetchone():
            raise KanbanError(f"Card '{title}' already exists on this board")
        update_fields.append("title = ?")
        params.append(title)
    if description is not None:
        update_fields.append("description = ?")
        params.append(description or f"Description: {title}" if title else description)
    if column_name is not None:
        update_fields.append("column_name = ?")
        params.append(column_name)
    if not update_fields:
        return False
    cursor.execute(f"UPDATE cards SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", params + [card_id])
    conn.commit()
    return True

def archive_card(db_path: str, card_id: int, board_id: Optional[int] = None) -> bool:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    if board_id is not None:
        cursor.execute("UPDATE cards SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND board_id = ?", (card_id, board_id))
    else:
        cursor.execute("UPDATE cards SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (card_id,))
    affected = cursor.rowcount
    conn.commit()
    return affected > 0

def delete_card(db_path: str, card_id: int, board_id: Optional[int] = None) -> bool:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    if board_id is not None:
        cursor.execute("DELETE FROM cards WHERE id = ? AND board_id = ?", (card_id, board_id))
    else:
        cursor.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    affected = cursor.rowcount
    conn.commit()
    return affected > 0

def add_comment(db_path: str, card_id: int, author: str, content: str) -> int:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO comments (card_id, author, content) VALUES (?, ?, ?)", (card_id, author or "CLI User", content))
    conn.commit()
    return cursor.lastrowid

def add_dependency(db_path: str, blocker_card_id: int, blocked_by_card_id: int, status: str = "open") -> int:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    if blocker_card_id == blocked_by_card_id:
        raise KanbanError("Cannot create self-dependency")
    cursor.execute("INSERT INTO dependencies (blocker_card_id, blocked_by_card_id, status) VALUES (?, ?, ?)", (blocker_card_id, blocked_by_card_id, status or "open"))
    conn.commit()
    return cursor.lastrowid

def get_dependencies(db_path: str, card_id: int) -> dict:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT c1.id, c1.title, c1.column_name FROM cards c1 JOIN dependencies d ON c1.id = d.blocker_card_id WHERE d.blocked_by_card_id = ? AND d.status != 'cancelled'", (card_id,))
    blockers = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT c2.id, c2.title, c2.column_name FROM cards c2 JOIN dependencies d ON c2.id = d.blocked_by_card_id WHERE d.blocker_card_id = ? AND d.status != 'cancelled'", (card_id,))
    blocked_by = [dict(r) for r in cursor.fetchall()]
    return {"blockers": blockers, "blocked_by": blocked_by}

def get_board_stats(db_path: str, board_id: int) -> dict:
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT column_name, COUNT(*) as count FROM cards WHERE board_id = ? AND status NOT IN ('archived','deleted') GROUP BY column_name", (board_id,))
    return {row["column_name"]: row["count"] for row in cursor.fetchall()}


class SQLiteDatabase:
    """Context manager for SQLite database operations."""
    def __init__(self, db_path: str):
        from pathlib import Path as _P
        self.db_path = _P(db_path).resolve()
        self._conn = None
        self._closed = False

    @property
    def connection(self):
        if not self._conn or self._closed:
            from .database import get_connection as _gc
            self._conn = _gc(str(self.db_path))
            self._closed = False
        return self._conn

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._conn and not self._closed:
            self._conn.close()
            self._closed = True
        return False
