"""
Database module — SQLite schema for Kanban boards.

Tables:
- cards: Kanban card records (title, description, column, status)
- columns: Board columns (Backlog, To Do, In Progress, etc.)
- boards: Kanban board metadata
- tags: Card tag definitions
- dependencies: Card dependency relationships
- comments: Comments on cards
"""
import sqlite3
from pathlib import Path
from typing import List, Optional, Tuple

# Database connection pool (single thread-safe instance)
_db_connection = None
_db_connection_closed = False

def get_connection(db_path: str) -> sqlite3.Connection:
    """Get a connection from the pool."""
    global _db_connection, _db_connection_closed
    if _db_connection is None or _db_connection_closed:
        _db_connection = sqlite3.connect(db_path, timeout=30.0)
        _db_connection.row_factory = sqlite3.Row
        _db_connection_closed = False
    return _db_connection


def reset_connection() -> None:
    """Reset the connection pool (for testing)."""
    global _db_connection, _db_connection_closed
    if _db_connection is not None and not _db_connection_closed:
        _db_connection.close()
    _db_connection = None
    _db_connection_closed = False

def init_schema(db_path: str) -> None:
    """Initialize all tables and indexes."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    # Cards table — core Kanban card records
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            column_name TEXT NOT NULL,  -- Backlog, To Do, In Progress, Review, Done, Blocked
            status TEXT NOT NULL DEFAULT 'active',  -- active, archived, deleted
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(title)  -- prevent duplicate card titles per board (enforced by app logic)
        )
    """)

    # Columns table — board columns with display order
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,  -- e.g., "Backlog", "To Do", "In Progress"
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#6c757d',  -- hex color for UI styling
            sort_order INTEGER DEFAULT 0
        )
    """)

    # Boards table — board metadata
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,  -- e.g., "Project X Backlog", "Bug Tracker"
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Tags table — reusable tag definitions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,  -- e.g., "high-priority", "feature-request"
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#007bff'
        )
    """)

    # Card-tags pivot table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS card_tags (
            card_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (card_id, tag_id),
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )
    """)

    # Dependencies table — card blocking/depends-on relationships
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blocker_card_id INTEGER NOT NULL,
            blocked_by_card_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',  -- open, resolved, cancelled
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (blocker_card_id) REFERENCES cards(id),
            FOREIGN KEY (blocked_by_card_id) REFERENCES cards(id)
        )
    """)

    # Comments table — card discussions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id INTEGER NOT NULL,
            author TEXT NOT NULL,  -- CLI username or system
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
        )
    """)

    # Indexes for fast queries
    cursor.execute("""CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_name)""")
    cursor.execute("""CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status)""")
    cursor.execute("""CREATE INDEX IF NOT EXISTS idx_card_tags_card_id ON card_tags(card_id)""")
    cursor.execute("""CREATE INDEX IF NOT EXISTS idx_dependencies_blocker ON dependencies(blocker_card_id, blocker_card_id)""")

    conn.commit()

# Pre-define standard columns (can be overridden per board)
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
    # Self-test: create in-memory DB and verify schema
    db_path = f"file:{tempfile.mkdtemp()}/kanban.db"
    init_schema(db_path)
    print(f"✓ Schema initialized at {db_path}")
