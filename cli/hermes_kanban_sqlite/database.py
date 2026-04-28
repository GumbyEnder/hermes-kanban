"""
Database module — SQLite schema for Kanban boards + LLM usage analytics.

Schema — boards (id, name, description)
        columns (id, board_id, name, description, color, sort_order)
        cards (id, board_id, title, description, column_name, due_date, status, created_at, updated_at)
        tags (id, name)
        card_tags (card_id, tag_id)
        dependencies (id, blocker_card_id, blocked_by_card_id)
        comments (id, card_id, author, content, created_at)
        usage_events (id, session_id, model, function_name, prompt_tokens, completion_tokens, cost, card_id, board_id, metadata, timestamp)

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

    # LLM Usage Events — token/cost tracking
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            model TEXT NOT NULL,
            function_name TEXT,
            prompt_tokens INTEGER NOT NULL,
            completion_tokens INTEGER NOT NULL,
            cost REAL NOT NULL,
            card_id INTEGER,
            board_id INTEGER,
            metadata TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL
        )
        """
    )

    # Sync metadata — bidirectional sync state
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            last_sqlite_sync TEXT,
            last_obsidian_sync TEXT,
            last_file_mtime INTEGER,
            file_hash TEXT,
            version INTEGER DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
            UNIQUE(board_id)
        )
        """
    )
    # Indexes for query performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_card_tags_card_id ON card_tags(card_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dependencies_blocker ON dependencies(blocker_card_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dependencies_blocked ON dependencies(blocked_by_card_id)")
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


def record_usage_event(
    db_path: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost: float,
    *,
    session_id: str | None = None,
    function_name: str | None = None,
    card_id: int | None = None,
    board_id: int | None = None,
    metadata: dict | None = None,
) -> int:
    """Insert a usage event row. Returns the new event ID."""
    import json
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO usage_events
        (session_id, model, function_name, prompt_tokens, completion_tokens, cost, card_id, board_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            model,
            function_name,
            prompt_tokens,
            completion_tokens,
            cost,
            card_id,
            board_id,
            json.dumps(metadata) if metadata else None,
        ),
    )

    conn.commit()
    return cursor.lastrowid


def get_usage_summary(db_path: str, *, start_date: str | None = None, end_date: str | None = None) -> dict:
    """Aggregate token/cost totals, optionally filtered by date range (ISO strings)."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    query = """
        SELECT
            COUNT(*) as events,
            SUM(prompt_tokens) as total_prompt,
            SUM(completion_tokens) as total_completion,
            SUM(cost) as total_cost,
            model,
            COUNT(*) as model_events
        FROM usage_events
    """
    params = []
    if start_date or end_date:
        query += " WHERE timestamp >= ? AND timestamp <= ?"
        params.extend([start_date or "1970-01-01", end_date or "2100-01-01"])
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    summary = {
        "total_events": sum(r["model_events"] for r in rows),
        "total_prompt_tokens": sum(r["total_prompt"] or 0 for r in rows),
        "total_completion_tokens": sum(r["total_completion"] or 0 for r in rows),
        "total_cost": sum(r["total_cost"] or 0 for r in rows),
        "by_model": {}
    }
    for r in rows:
        summary["by_model"][r["model"]] = {
            "events": r["model_events"],
            "prompt_tokens": r["total_prompt"] or 0,
            "completion_tokens": r["total_completion"] or 0,
            "cost": r["total_cost"] or 0.0,
        }
    return summary
    # --- Sync metadata ---
    # Tracks bidirectional sync state for conflict detection & incremental updates
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            last_sqlite_sync TEXT,       -- ISO timestamp of last successful push (SQLite -> Obsidian)
            last_obsidian_sync TEXT,      -- ISO timestamp of last successful pull (Obsidian -> SQLite)
            last_file_mtime INTEGER,      -- Obsidian file mtime (epoch seconds) at last push
            file_hash TEXT,               -- SHA256 of board file at last push (for change detection)
            version INTEGER DEFAULT 1,    -- Incremented on each sync for optimistic locking
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
            UNIQUE(board_id)
        )
        """
    )


