"""
Kanban logic module — CRUD operations for cards, columns, and boards.

This module handles all business logic independent of TUI rendering or CLI parsing.
"""
from pathlib import Path
from typing import List, Optional, Tuple
import sqlite3
from .database import init_schema, get_connection, STANDARD_COLUMNS

class KanbanError(Exception):
    """Base exception for kanban operations."""
    pass

def create_board(db_path: str, name: str, description: str = "") -> int:
    """Create a new board and return its ID."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Check if board already exists
    cursor.execute("SELECT id FROM boards WHERE name = ?", (name,))
    if cursor.fetchone():
        raise KanbanError(f"Board '{name}' already exists")
    
    cursor.execute(
        "INSERT INTO boards (name, description) VALUES (?, ?)",
        (name, description or f"Kanban board: {name}")
    )
    conn.commit()
    return cursor.lastrowid

def get_board(db_path: str, board_id: int) -> Optional[dict]:
    """Get a board by ID."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM boards WHERE id = ?", (board_id,))
    row = cursor.fetchone()
    return dict(row) if row else None

def list_boards(db_path: str) -> List[dict]:
    """List all boards."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM boards ORDER BY name")
    rows = cursor.fetchall()
    return [dict(row) for row in rows]

def create_column(db_path: str, board_id: int, name: str, description: str = "", color: str = "#6c757d", sort_order: int = 0) -> int:
    """Create a column and return its ID."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Check if column already exists
    cursor.execute("SELECT id FROM columns WHERE name = ?", (name,))
    if cursor.fetchone():
        raise KanbanError(f"Column '{name}' already exists on this board")
    
    cursor.execute(
        "INSERT INTO columns (name, description, color, sort_order) VALUES (?, ?, ?, ?)",
        (name, description or f"Column: {name}", color.lower(), sort_order)
    )
    conn.commit()
    return cursor.lastrowid

def get_columns(db_path: str, board_id: int) -> List[dict]:
    """Get columns for a board."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Columns are shared globally — just return all sorted by sort_order
    cursor.execute("SELECT * FROM columns ORDER BY sort_order")
    rows = cursor.fetchall()
    return [dict(row) for row in rows]

def create_card(db_path: str, board_id: int, title: str, column_name: str, description: str = "", tags: List[str] = None) -> int:
    """Create a card and return its ID."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Check if title already exists (enforced by UNIQUE constraint)
    cursor.execute(
        "SELECT id FROM cards WHERE title = ? AND status != 'deleted'",
        (title,)
    )
    if cursor.fetchone():
        raise KanbanError(f"Card '{title}' already exists")
    
    card_id = cursor.execute(
        "INSERT INTO cards (title, description, column_name) VALUES (?, ?, ?)",
        (title, description or f"Description: {title}", column_name)
    ).lastrowid
    
    # Add tags if provided
    if tags:
        for tag_name in tags:
            # Look up or create tag
            cursor.execute("SELECT id FROM tags WHERE name = ?", (tag_name,))
            row = cursor.fetchone()
            if row:
                tag_id = row[0]
            else:
                cursor.execute(
                    "INSERT INTO tags (name) VALUES (?)",
                    (tag_name,)
                )
                tag_id = cursor.lastrowid
            cursor.execute(
                "INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)",
                (card_id, tag_id)
            )
    
    conn.commit()
    return card_id

def get_card(db_path: str, card_id: int) -> Optional[dict]:
    """Get a card by ID."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM cards WHERE id = ?", (card_id,))
    row = cursor.fetchone()
    if not row:
        return None
    
    # Get associated tags
    cursor.execute(
        "SELECT t.name, t.description, t.color FROM tags t JOIN card_tags ct ON t.id = ct.tag_id WHERE ct.card_id = ?",
        (card_id,) if row else ()
    )
    tags = [dict(row) for row in cursor.fetchall()]
    
    # Get comments
    cursor.execute(
        "SELECT author, content, created_at FROM comments WHERE card_id = ? ORDER BY created_at",
        (card_id,)
    )
    comments = [dict(row) for row in cursor.fetchall()]
    
    return {
        **dict(row),
        "tags": tags,
        "comments": comments
    }

def list_cards(db_path: str, column_name: Optional[str] = None, status: Optional[str] = None) -> List[dict]:
    """List cards with optional filtering."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    query = "SELECT * FROM cards WHERE status NOT IN ('deleted', 'archived')"
    params = []
    
    if column_name is not None:
        query += " AND column_name = ?"
        params.append(column_name)
    
    if status is not None:
        query += " AND status = ?"
        params.append(status)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    return [dict(row) for row in rows]

def update_card(db_path: str, card_id: int, title: Optional[str] = None, description: Optional[str] = None,
                column_name: Optional[str] = None) -> bool:
    """Update a card. Returns True on success."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    update_fields = []
    params = []
    
    if title is not None:
        # Check for duplicate
        cursor.execute(
            "SELECT id FROM cards WHERE title = ? AND status != 'deleted'",
            (title,)
        )
        if cursor.fetchone():
            raise KanbanError(f"Card '{title}' already exists")
        update_fields.append("title = ?")
        params.append(title)
    
    if description is not None:
        update_fields.append("description = ?")
        params.append(description or f"Description: {title}")
    
    if column_name is not None:
        update_fields.append("column_name = ?")
        params.append(column_name)
    
    if not update_fields:
        return False  # No changes
    
    cursor.execute(
        f"UPDATE cards SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        params + [card_id]
    )
    conn.commit()
    return True

def archive_card(db_path: str, card_id: int) -> bool:
    """Archive (soft delete) a card."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("UPDATE cards SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (card_id,))
    affected = cursor.rowcount
    conn.commit()
    return affected > 0

def delete_card(db_path: str, card_id: int) -> bool:
    """Hard delete a card."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    affected = cursor.rowcount
    conn.commit()
    return affected > 0

def add_comment(db_path: str, card_id: int, author: str, content: str) -> int:
    """Add a comment to a card. Returns the new comment's ID."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute(
        "INSERT INTO comments (card_id, author, content) VALUES (?, ?, ?)",
        (card_id, author or "CLI User", content)
    )
    conn.commit()
    return cursor.lastrowid

def add_dependency(db_path: str, blocker_card_id: int, blocked_by_card_id: int, status: str = "open") -> int:
    """Add a dependency. Returns the new dependency's ID."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Prevent self-dependency
    if blocker_card_id == blocked_by_card_id:
        raise KanbanError("Cannot create self-dependency")
    
    cursor.execute(
        "INSERT INTO dependencies (blocker_card_id, blocked_by_card_id, status) VALUES (?, ?, ?)",
        (blocker_card_id, blocked_by_card_id, status or "open")
    )
    conn.commit()
    return cursor.lastrowid

def get_dependencies(db_path: str, card_id: int) -> List[dict]:
    """Get dependencies for a card."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Get cards that block this one (this is blocked by them)
    cursor.execute(
        "SELECT c1.id, c1.title, c1.column_name FROM cards c1 JOIN dependencies d ON c1.id = d.blocker_card_id WHERE d.blocked_by_card_id = ? AND d.status != 'cancelled'",
        (card_id,) if card_id else ()
    )
    blockers = [dict(row) for row in cursor.fetchall()]
    
    # Get cards this one blocks
    cursor.execute(
        "SELECT c2.id, c2.title, c2.column_name FROM cards c2 JOIN dependencies d ON c2.id = d.blocked_by_card_id WHERE d.blocker_card_id = ? AND d.status != 'cancelled'",
        (card_id,) if card_id else ()
    )
    blocked = [dict(row) for row in cursor.fetchall()]
    
    return {
        "blockers": blockers,
        "blocked_by": blocked
    }

def get_all_columns(db_path: str) -> List[dict]:
    """Get all columns (global, not per-board)."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM columns ORDER BY sort_order")
    rows = cursor.fetchall()
    return [dict(row) for row in rows]

# Database context manager (ensures proper connection closing)
class SQLiteDatabase:
    """Context manager for SQLite database operations."""
    
    def __init__(self, db_path: str):
        self.db_path = Path(db_path).resolve()
        self._conn = None
        self._closed = False

    @property
    def connection(self) -> sqlite3.Connection:
        if not self._conn or self._closed:
            self._conn = get_connection(str(self.db_path))
            self._closed = False
        return self._conn

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._conn and not self._closed:
            self._conn.close()
            self._closed = True
        return False  # Don't suppress exceptions
