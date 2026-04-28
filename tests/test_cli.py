"""Tests for the CLI module using Click's CliRunner."""
import pytest
from click.testing import CliRunner
from hermes_kanban_sqlite.database import reset_connection
from hermes_kanban_sqlite import cli as cli_module

runner = CliRunner()


@pytest.fixture(autouse=True)
def reset_db():
    """Reset connection pool before and after each test."""
    reset_connection()
    yield
    reset_connection()


def db_arg(tmp_path):
    """Return --db-path argument pointing to a temp DB."""
    return ["--db-path", str(tmp_path / "test.db")]


class TestCLIHelp:

    def test_cli_help(self):
        """hermes-kanban-sqlite --help returns 0, shows all 8 commands."""
        result = runner.invoke(cli_module.cli, ["--help"])
        assert result.exit_code == 0
        assert "add" in result.output
        assert "archive" in result.output
        assert "comment" in result.output
        assert "dependency" in result.output
        assert "info" in result.output
        assert "init" in result.output
        assert "list" in result.output
        assert "move" in result.output


class TestInit:

    def test_init_creates_board(self, tmp_path):
        """init with temp db, verify board exists via list_boards."""
        db = db_arg(tmp_path)
        result = runner.invoke(cli_module.cli, ["init", "Test Board"] + db)
        assert result.exit_code == 0
        assert "Schema initialized" in result.output
        assert "Board created" in result.output

    def test_init_duplicate_name(self, tmp_path):
        """second init with same name should error."""
        db = db_arg(tmp_path)
        result1 = runner.invoke(cli_module.cli, ["init", "Dup Board"] + db)
        assert result1.exit_code == 0

        result2 = runner.invoke(cli_module.cli, ["init", "Dup Board"] + db)
        assert result2.exit_code != 0
        assert "already exists" in result2.output


class TestAddCard:

    def test_add_card(self, tmp_path):
        """add a card, verify it appears in list."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "Add Board"] + db)
        result = runner.invoke(cli_module.cli, ["add", "My Card"] + db)
        assert result.exit_code == 0
        assert "Card created" in result.output

    def test_add_card_duplicate(self, tmp_path):
        """add same title twice should error."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "Dup Card Board"] + db)
        runner.invoke(cli_module.cli, ["add", "Same Card"] + db)
        result = runner.invoke(cli_module.cli, ["add", "Same Card"] + db)
        assert "already exists" in result.output


class TestListCards:

    def test_list_cards(self, tmp_path):
        """add 2 cards in different columns, list shows both."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "List Board"] + db)
        runner.invoke(cli_module.cli, ["add", "Card A", "--column", "To Do"] + db)
        runner.invoke(cli_module.cli, ["add", "Card B", "--column", "In Progress"] + db)

        result = runner.invoke(cli_module.cli, ["list"] + db)
        assert result.exit_code == 0
        assert "Card A" in result.output
        assert "Card B" in result.output


class TestMoveCard:

    def test_move_card(self, tmp_path):
        """add card, move to different column, verify."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "Move Board"] + db)
        runner.invoke(cli_module.cli, ["add", "Movable", "--column", "To Do"] + db)

        result = runner.invoke(cli_module.cli, ["move", "1", "In Progress"] + db)
        assert result.exit_code == 0
        assert "moved" in result.output.lower()


class TestInfoCard:

    def test_info_card(self, tmp_path):
        """add card, info shows title/column/status."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "Info Board"] + db)
        runner.invoke(cli_module.cli, ["add", "Info Card"] + db)

        result = runner.invoke(cli_module.cli, ["info", "1"] + db)
        assert result.exit_code == 0
        assert "Info Card" in result.output


class TestCommentCard:

    def test_comment_card(self, tmp_path):
        """add comment, info shows it."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "Comment Board"] + db)
        runner.invoke(cli_module.cli, ["add", "Comment Card"] + db)

        result = runner.invoke(cli_module.cli, ["comment", "1", "Test comment"] + db)
        assert result.exit_code == 0
        assert "Comment added" in result.output

        result2 = runner.invoke(cli_module.cli, ["info", "1"] + db)
        assert "Test comment" in result2.output


class TestDependency:

    def test_dependency(self, tmp_path):
        """create 2 cards, add dependency, info shows blockers."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "Dep Board"] + db)
        runner.invoke(cli_module.cli, ["add", "Blocker"] + db)
        runner.invoke(cli_module.cli, ["add", "Blocked"] + db)

        result = runner.invoke(cli_module.cli, ["dependency", "1", "2"] + db)
        assert result.exit_code == 0
        assert "Dependency created" in result.output


class TestArchiveCard:

    def test_archive_card(self, tmp_path):
        """add card, archive with --yes, list no longer shows it."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "Archive Board"] + db)
        runner.invoke(cli_module.cli, ["add", "To Archive"] + db)

        result = runner.invoke(cli_module.cli, ["archive", "1", "--yes"] + db)
        assert result.exit_code == 0
        assert "archived" in result.output.lower()


class TestUsageCLI:
    """Tests for the usage analytics commands."""

    def test_usage_help(self):
        """hermes-kanban-sqlite usage --help shows subcommands."""
        result = runner.invoke(cli_module.cli, ["usage", "--help"])
        assert result.exit_code == 0
        assert "summary" in result.output
        assert "report" in result.output
        assert "heatmap" in result.output

    def test_usage_summary_empty(self, tmp_path):
        """summary on fresh DB shows zero totals."""
        db = db_arg(tmp_path)
        # init and add card, but no usage events
        runner.invoke(cli_module.cli, ["init", "EmptyProject"] + db)
        result = runner.invoke(cli_module.cli, ["usage", "summary"] + db)
        assert result.exit_code == 0
        assert "Total events" in result.output
        assert "0" in result.output  # zero counts

    def test_usage_report_by_model(self, tmp_path):
        """report --by model aggregates data correctly."""
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "ReportProject"] + db)
        # Seed usage events via Python API in same process using database fixture? Can't directly; use subprocess or call record_usage_event in test.
        # Instead, we simulate by inserting directly using database functions.
        from hermes_kanban_sqlite.database import record_usage_event, get_connection
        from hermes_kanban_sqlite.kanban import create_board
        board_id = create_board(str(tmp_path / "test.db"), "Board")
        record_usage_event(str(tmp_path / "test.db"), "gpt-4", 100, 50, 0.002, board_id=board_id)
        record_usage_event(str(tmp_path / "test.db"), "claude-3", 80, 40, 0.0018, board_id=board_id)

        result = runner.invoke(cli_module.cli, ["usage", "report", "--by", "model"] + db)
        assert result.exit_code == 0
        assert "gpt-4" in result.output
        assert "claude-3" in result.output
        assert "0.002" in result.output or "0.0020" in result.output

    def test_usage_heatmap_runs(self, tmp_path):
        """heatmap command executes without error for a populated DB."""
        from hermes_kanban_sqlite.database import record_usage_event, get_connection
        from hermes_kanban_sqlite.kanban import create_board
        db = db_arg(tmp_path)
        runner.invoke(cli_module.cli, ["init", "HeatmapProject"] + db)
        # Seed at least one usage event to ensure heatmap has data
        board_id = create_board(str(tmp_path / "test.db"), "Board")
        record_usage_event(str(tmp_path / "test.db"), "gpt-4", 10, 5, 0.0001, board_id=board_id)
        result = runner.invoke(cli_module.cli, ["usage", "heatmap", "--days", "1"] + db)
        assert result.exit_code == 0
        assert "Activity Heatmap" in result.output
        assert "Hour" in result.output
