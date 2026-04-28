"""
Database module — SQLite schema for Kanban boards.

Tables:
- boards: Project/board metadata
- columns: Column definitions (global across boards)
- cards: Tasks (board-scoped via board_id)
- tags: Tag vocabulary
- card_tags: Card→tag many-to-many
- dependencies: Card blocking relationships
- comments: Card discussion threads
"""
import sqlite3
from pathlib import Path
from typing import Optional

# Connection pool singleton
_db_connection = None
_db_connection_path = None
_db_connection_closed = False

def get_connection(db_path: str) -> sqlite3.Connection:
    """Get a connection from the pool (creates new if needed)."""
    global _db_connection, _db_connection_path, _db_connection_closed
    if _db_connection is None or _db_connection_closed or _db_connection_path != db_path:
        if _db_connection is not None and not _db_connection_closed:
            _db_connection.close()
        _db_connection = sqlite3.connect(db_path, timeout=30.0)
        _db_connection.row_factory = sqlite3.Row
        _db_connection_path = db_path
        _db_connection_closed = False
    return _db_connection

def reset_connection() -> None:
    """Reset the connection pool (used by tests)."""
    global _db_connection, _db_connection_path, _db_connection_closed
    if _db_connection is not None and not _db_connection_closed:
        _db_connection.close()
    _db_connection = None
    _db_connection_path = None
    _db_connection_closed = False

def init_schema(db_path: str) -> None:
    """Initialize all tables, indexes, and migrate legacy single-board DBs."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    # 1. Boards (must exist before cards for FK)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 2. Columns (global, not per-board)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#6c757d',
            sort_order INTEGER DEFAULT 0
        )
    """)

    # 3. Cards — now board-scoped
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL DEFAULT 1,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            column_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(board_id, title),
            FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
        )
    """)

    # 4. Tags
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#007bff'
        )
    """)

    # 5. Card-tags pivot
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS card_tags (
            card_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (card_id, tag_id),
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    """)

    # 6. Dependencies
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blocker_card_id INTEGER NOT NULL,
            blocked_by_card_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (blocker_card_id) REFERENCES cards(id),
            FOREIGN KEY (blocked_by_card_id) REFERENCES cards(id)
        )
    """)

    # 7. Comments
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
        )
    """)

    # Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_card_tags_card_id ON card_tags(card_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dependencies_blocker ON dependencies(blocker_card_id, blocked_by_card_id)")

    conn.commit()

    # Migration: upgrade legacy DBs (pre-board_id) to multi-board
    cursor.execute("PRAGMA table_info(cards)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'board_id' not in columns:
        try:
            print("[MIGRATION] Adding board_id column to cards table...")
            cursor.execute("ALTER TABLE cards ADD COLUMN board_id INTEGER DEFAULT 1")
            cursor.execute("UPDATE cards SET board_id = 1 WHERE board_id IS NULL")
            # New composite unique index matches UNIQUE(board_id, title) from CREATE TABLE
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_board_title ON cards(board_id, title)")
            conn.commit()
            print("[MIGRATION] board_id column added and backfilled to existing cards.")
        except Exception as e:
            print(f"[WARN] board_id migration skipped: {e}")

# Standard column definitions (global)
STANDARD_COLUMNS = [
    ("Backlog", "Cards waiting to be picked up", "#28a745", 0),
    ("To Do", "Ready for work this cycle", "#17a2b8", 1),
    ("In Progress", "Currently being worked on", "#ffc107", 2),
    ("Review", "Awaiting code review or testing", "#fd7e14", 3),
    ("Done", "Completed and verified", "#28a745", 4),
    ("Blocked", "Waiting on external dependency", "#dc3545", 5),
]

if __name__ == "__main__":
    import tempfile
    db_path = f"file:{tempfile.mkdtemp()}/kanban.db"
    init_schema(db_path)
    print(f"✓ Schema initialized at {db_path}")
