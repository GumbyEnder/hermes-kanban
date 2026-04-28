"""Tests for the SQLite → Obsidian sync module."""
import pytest
from pathlib import Path
from hermes_kanban_sqlite.database import init_schema, reset_connection
from hermes_kanban_sqlite.kanban import create_board, create_card
from hermes_kanban_sqlite.sync import sync_to_obsidian

OBSIDIAN_FRONTMATTER = """---
kanban-plugin: board
---"""


@pytest.fixture(autouse=True)
def reset_db():
    reset_connection()
    yield
    reset_connection()


def _setup_db(tmp_path):
    db_path = str(tmp_path / "test.db")
    reset_connection()
    init_schema(db_path)
    return db_path


class TestSyncToObsidian:

    def test_sync_empty_db(self, tmp_path):
        """No boards in DB returns error."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")
        result = sync_to_obsidian(db_path, vault)
        assert "No boards found" in result["errors"][0]

    def test_sync_creates_board_file(self, tmp_path):
        """Sync creates a valid Obsidian Kanban markdown file."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")

        board_id = create_board(db_path, "Test Board")
        create_card(db_path, board_id, "Card One", "To Do")
        create_card(db_path, board_id, "Card Two", "Done")

        result = sync_to_obsidian(db_path, vault)

        assert result["cards_synced"] == 2
        assert result["columns_synced"] == 6  # standard 6 columns
        assert result["board_file"].endswith("Test-Board.md")
        assert Path(result["board_file"]).exists()

        content = Path(result["board_file"]).read_text()
        assert OBSIDIAN_FRONTMATTER in content
        assert "## To Do" in content
        assert "- [ ] Card One" in content
        assert "## Done" in content
        assert "- [x] Card Two" in content

    def test_sync_with_tags(self, tmp_path):
        """Cards with tags include tag metadata."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")

        board_id = create_board(db_path, "Tagged Board")
        create_card(db_path, board_id, "Tagged Card", "To Do", tags=["urgent", "frontend"])

        result = sync_to_obsidian(db_path, vault)
        content = Path(result["board_file"]).read_text()

        assert "**Tags**: urgent, frontend" in content

    def test_sync_custom_board_name(self, tmp_path):
        """Custom board name overrides DB board name."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")

        board_id = create_board(db_path, "Internal Name")
        create_card(db_path, board_id, "A Card", "To Do")

        result = sync_to_obsidian(db_path, vault, board_name="My Custom Board")

        assert result["board_file"].endswith("My-Custom-Board.md")

    def test_sync_blocked_column(self, tmp_path):
        """Blocked column cards get [-] checkbox."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")

        board_id = create_board(db_path, "Blocked Board")
        create_card(db_path, board_id, "Stuck Card", "Blocked")

        result = sync_to_obsidian(db_path, vault)
        content = Path(result["board_file"]).read_text()

        assert "- [-] Stuck Card" in content

    def test_sync_creates_vault_dir(self, tmp_path):
        """Vault directory is created if it doesn't exist."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "nonexistent" / "vault")

        board_id = create_board(db_path, "Dir Test Board")
        create_card(db_path, board_id, "Test", "To Do")

        result = sync_to_obsidian(db_path, vault)
        assert Path(result["board_file"]).exists()
