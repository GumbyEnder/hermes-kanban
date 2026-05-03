"""
Layer 1 — CLI Workflow E2E Tests

Real subprocess invocation of `hermes-kanban-sqlite` CLI binary.
Tests multi-step workflows against temporary SQLite databases.
No Obsidian required.
"""
import subprocess
import pytest
from pathlib import Path

CLI = "hermes-kanban-sqlite"


def _run(*args, expect_ok=True, stdin=None, timeout=30):
    """Run CLI with args, return (exit_code, stdout, stderr)."""
    cmd = [CLI] + list(args)
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout,
        input=stdin
    )
    if expect_ok and result.returncode != 0:
        raise AssertionError(
            f"Expected exit 0, got {result.returncode}\n"
            f"CMD: {' '.join(cmd)}\n"
            f"STDERR: {result.stderr}\n"
            f"STDOUT: {result.stdout}"
        )
    return result.returncode, result.stdout, result.stderr


# ── Workflow 1: Full Lifecycle ──────────────────────────────────────────

class TestFullLifecycle:
    """End-to-end: init → add → list → move → info → comment → dependency → archive."""

    @pytest.fixture
    def db(self, tmp_path):
        db_path = str(tmp_path / "lifecycle.db")
        _run("init", "Lifecycle Board", "--db-path", db_path)
        return db_path

    def test_init_output(self, db):
        """Init output mentions board created and schema initialized."""
        rc, stdout, _ = _run("init", "Second Board", "--db-path", db)
        assert "Schema initialized" in stdout
        assert "Second Board" in stdout

    def test_add_multiple_cards(self, db):
        """Add 3 cards and verify they appear in list."""
        _run("add", "Write tests", "--db-path", db)
        _run("add", "Fix bugs", "--db-path", db)
        _run("add", "Deploy", "--db-path", db)

        _, stdout, _ = _run("list", "--db-path", db)
        assert "Write tests" in stdout
        assert "Fix bugs" in stdout
        assert "Deploy" in stdout

    def test_move_card_between_columns(self, db):
        """Move a card from To Do → In Progress → Done."""
        _run("add", "Movable Card", "--db-path", db)

        _, stdout, _ = _run("list", "--db-path", db)
        lines = [l for l in stdout.split("\n") if "Movable Card" in l]
        assert lines, f"Card not found in:\n{stdout}"
        card_id = lines[0].strip().split()[0].strip("[]")

        _run("move", card_id, "In Progress", "--db-path", db)
        _, stdout, _ = _run("info", card_id, "--db-path", db)
        assert "In Progress" in stdout

        _run("move", card_id, "Done", "--db-path", db)
        _, stdout, _ = _run("info", card_id, "--db-path", db)
        assert "Done" in stdout

    def test_card_info_shows_metadata(self, db):
        """info command shows title, column."""
        _run("add", "Info Card", "--db-path", db)
        _, stdout, _ = _run("list", "--db-path", db)
        lines = [l for l in stdout.split("\n") if "Info Card" in l]
        card_id = lines[0].strip().split()[0].strip("[]")

        _, stdout, _ = _run("info", card_id, "--db-path", db)
        assert "Info Card" in stdout
        assert "Column:" in stdout

    def test_add_comment_to_card(self, db):
        """Add a comment to a card and verify it appears in info."""
        _run("add", "Commented Card", "--db-path", db)
        _, stdout, _ = _run("list", "--db-path", db)
        lines = [l for l in stdout.split("\n") if "Commented Card" in l]
        card_id = lines[0].strip().split()[0].strip("[]")

        _run("comment", card_id, "Needs review ASAP", "--db-path", db)
        _, stdout, _ = _run("info", card_id, "--db-path", db)
        assert "Needs review ASAP" in stdout

    def test_add_dependency_between_cards(self, db):
        """Create a dependency: Card B blocked by Card A."""
        _run("add", "Blocker Card", "--db-path", db)
        _run("add", "Blocked Card", "--db-path", db)
        _, stdout, _ = _run("list", "--db-path", db)

        a_lines = [l for l in stdout.split("\n") if "Blocker Card" in l]
        b_lines = [l for l in stdout.split("\n") if "Blocked Card" in l]
        blocker_id = a_lines[0].strip().split()[0].strip("[]")
        blocked_id = b_lines[0].strip().split()[0].strip("[]")

        _run("dependency", blocker_id, blocked_id, "--db-path", db)
        _, stdout, _ = _run("info", blocked_id, "--db-path", db)
        assert "Blocked by" in stdout

    def test_archive_card(self, db):
        """Archive a card and verify it disappears from list."""
        _run("add", "Archivable", "--db-path", db)
        _, stdout, _ = _run("list", "--db-path", db)
        lines = [l for l in stdout.split("\n") if "Archivable" in l]
        card_id = lines[0].strip().split()[0].strip("[]")

        _run("archive", card_id, "--db-path", db, stdin="y\n")
        _, stdout, _ = _run("list", "--db-path", db)
        assert "Archivable" not in stdout

    def test_full_workflow_sequence(self, db):
        """Execute a complete sequence: add→move→comment→dependency→archive."""
        # Add cards
        _run("add", "SEQ Research", "--db-path", db)
        _run("add", "SEQ Implement", "--db-path", db)
        _run("add", "SEQ Test", "--db-path", db)

        _, stdout, _ = _run("list", "--db-path", db)
        for title in ["SEQ Research", "SEQ Implement", "SEQ Test"]:
            assert title in stdout, f"Missing card: {title}"

        # Extract IDs
        lines_map = {}
        for l in stdout.split("\n"):
            for title in ["SEQ Research", "SEQ Implement", "SEQ Test"]:
                if title in l:
                    lines_map[title] = l.strip().split()[0].strip("[]")

        # Move SEQ Research → In Progress
        _run("move", lines_map["SEQ Research"], "In Progress", "--db-path", db)
        _, stdout, _ = _run("info", lines_map["SEQ Research"], "--db-path", db)
        assert "In Progress" in stdout

        # Comment on SEQ Implement
        _run("comment", lines_map["SEQ Implement"], "Wait for API fix", "--db-path", db)

        # Dependency: SEQ Test blocked by SEQ Research
        _run("dependency", lines_map["SEQ Research"],
             lines_map["SEQ Test"], "--db-path", db)

        # Archive SEQ Implement
        _run("archive", lines_map["SEQ Implement"], "--db-path", db, stdin="y\n")
        _, stdout, _ = _run("list", "--db-path", db)
        assert "SEQ Implement" not in stdout


# ── Demo Command ────────────────────────────────────────────────────────

class TestDemoCommand:
    """Test the `demo` subcommand."""

    def test_demo_creates_board(self, tmp_path):
        """demo command populates sample data (needs init first)."""
        db_path = str(tmp_path / "demo.db")
        _run("init", "Demo Board", "--db-path", db_path)
        rc, stdout, stderr = _run("demo", "--db-path", db_path)
        assert rc == 0
        # Should have created something
        _, stdout, _ = _run("list", "--db-path", db_path)
        assert "card" in stdout.lower() or "Card" in stdout or stdout.strip() != ""


# ── Usage Analytics ─────────────────────────────────────────────────────

class TestUsageCommands:
    """Test `usage` subcommand group."""

    @pytest.fixture
    def db(self, tmp_path):
        db_path = str(tmp_path / "usage.db")
        _run("init", "Usage Board", "--db-path", db_path)
        return db_path

    def test_usage_summary(self, db):
        """usage summary returns zero exit."""
        rc, stdout, _ = _run("usage", "summary", "--db-path", db)
        assert rc == 0

    def test_usage_report(self, db):
        """usage report returns zero exit."""
        rc, stdout, _ = _run("usage", "report", "--db-path", db)
        assert rc == 0

    def test_usage_heatmap(self, db):
        """usage heatmap returns zero exit."""
        rc, stdout, _ = _run("usage", "heatmap", "--db-path", db)
        assert rc == 0


# ── Sync Commands ───────────────────────────────────────────────────────

class TestSyncCommands:
    """Test the `sync` command."""

    @pytest.fixture
    def db(self, tmp_path):
        db_path = str(tmp_path / "sync.db")
        _run("init", "Sync Board", "--db-path", db_path)
        _run("add", "Sync Card 1", "--db-path", db_path)
        _run("add", "Sync Card 2", "--db-path", db_path)
        return db_path

    def test_sync_to_vault(self, db, tmp_path):
        """sync --vault-dir produces markdown files."""
        vault = str(tmp_path / "vault")
        rc, stdout, _ = _run("sync", "--db-path", db,
                               "--vault-dir", vault, "--force")
        assert rc == 0
        # Should create a board markdown file
        md_files = list(Path(vault).rglob("*.md"))
        assert len(md_files) >= 1, f"No .md files in {vault}"


# ── Error Handling ──────────────────────────────────────────────────────

class TestErrorHandling:
    """Verify graceful behavior for invalid inputs."""

    @pytest.fixture
    def db(self, tmp_path):
        db_path = str(tmp_path / "errors.db")
        _run("init", "Error Board", "--db-path", db_path)
        return db_path

    def test_duplicate_board_rejected(self, tmp_path):
        """Creating board with same name twice should fail."""
        db_path = str(tmp_path / "dup.db")
        _run("init", "Duplicate", "--db-path", db_path)
        rc, stdout, _ = _run("init", "Duplicate", "--db-path", db_path,
                              expect_ok=False)
        assert rc != 0

    def test_duplicate_card_rejected(self, db):
        """Adding same card title twice should fail."""
        _run("add", "Dup Card", "--db-path", db)
        rc, stdout, _ = _run("add", "Dup Card", "--db-path", db,
                              expect_ok=False)
        assert rc != 0

    def test_move_nonexistent_card(self, db):
        """Moving a nonexistent card ID should fail."""
        rc, stdout, _ = _run("move", "99999", "Done", "--db-path", db,
                              expect_ok=False)
        assert rc != 0

    def test_info_nonexistent_card(self, db):
        """Getting info on nonexistent card should fail."""
        rc, stdout, _ = _run("info", "99999", "--db-path", db,
                              expect_ok=False)
        assert rc != 0

    def test_missing_db_graceful(self, tmp_path):
        """Command without --db-path doesn't crash/hang."""
        rc, _, _ = _run("list", expect_ok=False)
        assert rc in (0, 1)


# ── Help & Version ──────────────────────────────────────────────────────

class TestHelpAndCommands:
    """Verify help output lists all commands."""

    COMMANDS = [
        "add", "archive", "comment", "demo", "dependency",
        "info", "init", "list", "move", "sync", "tui", "usage",
    ]

    def test_top_level_help(self):
        """--help lists all commands."""
        _, stdout, _ = _run("--help")
        for cmd in self.COMMANDS:
            assert cmd in stdout, f"Command '{cmd}' missing from top-level help"

    def test_subcommand_help(self):
        """Each subcommand supports --help."""
        for cmd in ["init", "add", "list", "move", "info", "comment",
                     "dependency", "archive", "sync", "tui", "demo", "usage"]:
            rc, _, _ = _run(cmd, "--help")
            assert rc == 0, f"{cmd} --help failed"


# ── Multi-Board Handling ────────────────────────────────────────────────

class TestMultiBoard:
    """Test with multiple boards in a single database."""

    @pytest.fixture
    def db(self, tmp_path):
        db_path = str(tmp_path / "multi.db")
        _run("init", "Board Alpha", "--db-path", db_path)
        _run("init", "Board Bravo", "--db-path", db_path)
        return db_path

    def test_list_defaults_to_first_board(self, db):
        """list without --board defaults to first board's cards."""
        _run("add", "Alpha Card", "--board", "Board Alpha", "--db-path", db)

        _, stdout, _ = _run("list", "--db-path", db)
        assert "Alpha Card" in stdout

    def test_list_filtered_by_board_name(self, db):
        """list --board filters to specific board."""
        _run("add", "Alpha Only", "--board", "Board Alpha", "--db-path", db)
        _run("add", "Bravo Only", "--board", "Board Bravo", "--db-path", db)

        _, stdout, _ = _run("list", "--board", "Board Alpha", "--db-path", db)
        assert "Alpha Only" in stdout
        assert "Bravo Only" not in stdout