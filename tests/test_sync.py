"""Tests for the SQLite → Obsidian sync module."""
import pytest
from pathlib import Path
from hermes_kanban_sqlite.database import init_schema, reset_connection
from hermes_kanban_sqlite.kanban import create_board, create_card
from hermes_kanban_sqlite.sync import sync_to_obsidian
from datetime import datetime, timedelta

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


class TestSyncDryRun:
    """dry-run flag prevents file writes."""

    def test_dry_run_does_not_write_file(self, tmp_path):
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")
        board_id = create_board(db_path, "DryRun Board")
        create_card(db_path, board_id, "Card", "To Do")

        result = sync_to_obsidian(db_path, vault, dry_run=True, force=False)
        assert result["dry_run"] is True
        assert any("dry-run" in w for w in result["warnings"])
        assert "would_write" in result
        # No file on disk
        md_files = list(Path(vault).rglob("*.md"))
        assert len(md_files) == 0


class TestSyncConflictAndForce:
    """Conflict detection and --force behavior."""

    def _touch_file(self, path: Path):
        import os, time
        time.sleep(0.05)
        path.touch()
        os.utime(path, None)

    def test_conflict_blocks_push_without_force(self, tmp_path):
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")
        board_id = create_board(db_path, "Conflict Board")
        create_card(db_path, board_id, "Card A", "To Do")

        # Initial successful push establishes baseline mtime
        r1 = sync_to_obsidian(db_path, vault, dry_run=False, force=False)
        board_file = Path(r1["board_file"])
        original_content = board_file.read_text()

        # Simulate external edit (touch file to newer mtime)
        self._touch_file(board_file)

        # Second push without --force should report conflict and error
        r2 = sync_to_obsidian(db_path, vault, dry_run=False, force=False)
        assert r2["conflicts"] == 1
        assert any("Use --force" in e for e in r2["errors"])
        # File content unchanged
        assert board_file.read_text() == original_content

    def test_force_overwrites_external_edit(self, tmp_path):
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")
        board_id = create_board(db_path, "Force Board")
        create_card(db_path, board_id, "Card A", "To Do")

        r1 = sync_to_obsidian(db_path, vault)
        board_file = Path(r1["board_file"])

        # Simulate external edit
        self._touch_file(board_file)

        # Force push should succeed
        r2 = sync_to_obsidian(db_path, vault, dry_run=False, force=True)
        assert len(r2["errors"]) == 0 or r2["errors"] == []
        # Confirm file still contains the card
        content = board_file.read_text()
        assert "Card A" in content


class TestSyncPull:
    """Bidirectional pull from Obsidian → SQLite."""

    def test_pull_imports_new_card_without_id(self, tmp_path):
        """A card without ID in markdown creates a new DB card."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")
        board_id = create_board(db_path, "PullBoard")
        # Write a card without ID (no ID meta)
        board_file = Path(vault) / "PullBoard.md"
        board_file.parent.mkdir(parents=True, exist_ok=True)
        board_file.write_text(
            "---\nkanban-plugin: board\n---\n\n"
            "# PullBoard\n\n"
            "## To Do\n\n"
            "- [ ] Import New\n"
            "    - **Status**: active\n"
            "    - **Created**: 2026-04-27T12:00:00\n"
            "    - **Updated**: 2026-04-27T12:00:00\n\n"
        )
        from hermes_kanban_sqlite.sync import sync_from_obsidian
        result = sync_from_obsidian(db_path, vault, board_name="PullBoard", dry_run=False)
        assert result["cards_created"] == 1
        assert result["errors"] == []

    def test_pull_updates_existing_card_when_newer(self, tmp_path):
        """If Obsidian card has newer Updated timestamp, DB updates."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")
        board_id = create_board(db_path, "UpdateBoard")
        card_id = create_card(db_path, board_id, "Old Title", "To Do")

        board_file = Path(vault) / "UpdateBoard.md"
        board_file.parent.mkdir(parents=True, exist_ok=True)
        newer = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
        board_file.write_text(
            "---\nkanban-plugin: board\n---\n\n"
            "# UpdateBoard\n\n"
            "## To Do\n\n"
            f"- [ ] New Title\n"
            f"    - **ID**: {card_id}\n"
            f"    - **Status**: active\n"
            f"    - **Created**: 2026-01-01T00:00:00\n"
            f"    - **Updated**: {newer}\n\n"
        )
        from hermes_kanban_sqlite.sync import sync_from_obsidian
        result = sync_from_obsidian(db_path, vault, board_name="UpdateBoard")
        assert result["cards_updated"] == 1
        assert result["conflicts_skipped"] == 0
        from hermes_kanban_sqlite.kanban import get_card
        card = get_card(db_path, card_id)
        assert card["title"] == "New Title"

    def test_pull_skips_when_db_newer(self, tmp_path):
        """If DB updated_at is newer than Obsidian Updated, skip and report conflict."""
        db_path = _setup_db(tmp_path)
        vault = str(tmp_path / "vault")
        board_id = create_board(db_path, "SkipBoard")
        card_id = create_card(db_path, board_id, "DB Newer", "To Do")

        # Force DB updated_at to be in the future so it is strictly newer than Obsidian file timestamp
        from hermes_kanban_sqlite.database import get_connection
        conn = get_connection(db_path)
        cur = conn.cursor()
        future_ts = (datetime.utcnow() + timedelta(seconds=60)).strftime("%Y-%m-%dT%H:%M:%S")
        cur.execute("UPDATE cards SET updated_at = ? WHERE id = ?", (future_ts, card_id))
        conn.commit()

        board_file = Path(vault) / "SkipBoard.md"
        board_file.parent.mkdir(parents=True, exist_ok=True)
        # Use a timestamp older than DB's updated_at
        old_ts = (datetime.utcnow() - timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%S")
        board_file.write_text(
            "---\nkanban-plugin: board\n---\n\n"
            "# SkipBoard\n\n"
            "## To Do\n\n"
            f"- [ ] Old Title\n"
            f"    - **ID**: {card_id}\n"
            f"    - **Status**: active\n"
            f"    - **Created**: 2026-01-01T00:00:00\n"
            f"    - **Updated**: {old_ts}\n\n"
        )
        from hermes_kanban_sqlite.sync import sync_from_obsidian
        result = sync_from_obsidian(db_path, vault, board_name="SkipBoard")
        assert result["conflicts_skipped"] == 1
        assert any("newer DB" in w for w in result["warnings"])

