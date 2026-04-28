"""
Database module — SQLite schema for Kanban boards.

Schema — boards (id, name, description)
        columns (id, board_id, name, description, color, sort_order)
        cards (id, board_id, title, description, column_name, due_date, status, created_at, updated_at)
        tags (id, name)
        card_tags (card_id, tag_id)
        dependencies (id, blocker_card_id, blocked_by_card_id)
        comments (id, card_id, author, content, created_at)

All constraints and indexes created in init_schema().
Legacy DB migration (pre-board_id) runs automatically on first open.
"""

import sqlite3
from pathlib import Path
from typing import Optional

_db_connection: Optional[sqlite3.Connection] = None
_db_connection_path: Optional[str] = None
_db_connection_closed: bool = False


def get_connection(db_path: str) -> sqlite3.Connection:
    global _db_connection, _db_connection_path, _db_connection_closed
    if _db_connection is not None and not _db_connection_closed:
        if _db_connection_path != db_path:
            _db_connection.close()
            _db_connection = None
            _db_connection_path = None
        else:
            return _db_connection
    _db_connection = sqlite3.connect(db_path)
    _db_connection.row_factory = sqlite3.Row
    _db_connection_path = db_path
    _db_connection_closed = False
    return _db_connection


def close_connection():
    global _db_connection, _db_connection_closed
    if _db_connection is not None:
        _db_connection.close()
        _db_connection_closed = True


def reset_connection():
    global _db_connection, _db_connection_path, _db_connection_closed
    if _db_connection is not None:
        try:
            _db_connection.close()
        except Exception:
            pass
    _db_connection = None
    _db_connection_path = None
    _db_connection_closed = False


def init_schema(db_path: str) -> None:
    conn = get_connection(db_path)
    cursor = conn.cursor()

    # Boards
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # Columns — each belongs to a board (board_id references boards)
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT,
            sort_order INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
            UNIQUE(board_id, name)
        )
        """
    )

    # Cards — now board-scoped
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL DEFAULT 1,
            title TEXT NOT NULL,
            description TEXT,
            column_name TEXT NOT NULL DEFAULT 'To Do',
            due_date TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            is_blocked BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
            UNIQUE(board_id, title)
        )
        """
    )

    # Tags and card_tags (many-to-many)
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS card_tags (
            card_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (card_id, tag_id),
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
        """
    )

    # Dependencies — blocker → blocked
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blocker_card_id INTEGER NOT NULL,
            blocked_by_card_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (blocker_card_id) REFERENCES cards(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_by_card_id) REFERENCES cards(id) ON DELETE CASCADE,
            UNIQUE(blocker_card_id, blocked_by_card_id)
        )
        """
    )

    # Comments
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
        )
        """
    )

    conn.commit()

    # --- LEGACY MIGRATION (pre-board_id) — MUST run BEFORE indexing board_id ---
    cursor.execute("PRAGMA table_info(cards)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'board_id' not in columns:
        try:
            cursor.execute("ALTER TABLE cards ADD COLUMN board_id INTEGER DEFAULT 1")
            cursor.execute("UPDATE cards SET board_id = 1 WHERE board_id IS NULL")
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_board_title ON cards(board_id, title)")
            conn.commit()
        except Exception as e:
            print(f"[MIGRATION] Skipped board_id migration: {e}")

    # Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_card_tags_card_id ON card_tags(card_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dependencies_blocker ON dependencies(blocker_card_id, blocked_by_card_id)")

    conn.commit()


STANDARD_COLUMNS = [
    ("Backlog",    "Cards waiting to be picked up",     "#28a745",  0),
    ("To Do",      "Ready for work this cycle",          "#17a2b8",  1),
    ("In Progress","Currently being worked on",           "#ffc107",  2),
    ("Review",     "Awaiting review or approval",        "#6f42c1",  3),
    ("Done",       "Completed work",                     "#28a745",  4),
    ("Blocked",    "Cannot proceed — blocked item",     "#dc3545",  5),
]


class SQLiteDatabase:
    """Context manager for SQLite database operations."""
    def __init__(self, db_path: str):
        from pathlib import Path
        self.db_path = str(Path(db_path).expanduser().resolve())
        self.conn: Optional[sqlite3.Connection] = None

    def __enter__(self):
        self.conn = get_connection(self.db_path)
        return self.conn.cursor()

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
