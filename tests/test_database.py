"""Tests for the database module."""
import pytest
from hermes_kanban_sqlite.database import (
    init_schema,
    get_connection,
    reset_connection,
    STANDARD_COLUMNS,
)


class TestInitSchema:

    def test_init_schema_creates_tables(self, tmp_path):
        """init with :memory: DB, verify all 7 tables exist."""
        db_path = str(tmp_path / "test.db")
        reset_connection()
        init_schema(db_path)

        conn = get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row["name"] for row in cursor.fetchall()]
        reset_connection()

        expected = ["boards", "card_tags", "cards", "columns", "comments", "dependencies", "tags", "usage_events"]
        for table in expected:
            assert table in tables, f"Table '{table}' not found in {tables}"

    def test_init_schema_creates_indexes(self, tmp_path):
        """verify expected indexes exist."""
        db_path = str(tmp_path / "test.db")
        reset_connection()
        init_schema(db_path)

        conn = get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
        )
        indexes = [row["name"] for row in cursor.fetchall()]
        reset_connection()

        expected = [
            "idx_cards_column",
            "idx_cards_status",
            "idx_card_tags_card_id",
            "idx_dependencies_blocker",
        ]
        for idx in expected:
            assert idx in indexes, f"Index '{idx}' not found in {indexes}"

    def test_get_connection_returns_connection(self, tmp_path):
        """verify connection has row_factory set."""
        db_path = str(tmp_path / "test.db")
        reset_connection()

        conn = get_connection(db_path)
        assert conn is not None
        assert conn.row_factory == pytest.importorskip("sqlite3").Row
        reset_connection()

    def test_get_connection_reuses_connection(self, tmp_path):
        """two calls to get_connection with same db_path return same object."""
        db_path = str(tmp_path / "test.db")
        reset_connection()

        conn1 = get_connection(db_path)
        conn2 = get_connection(db_path)
        assert conn1 is conn2
        reset_connection()

    def test_init_schema_idempotent(self, tmp_path):
        """calling init_schema twice does not raise an error."""
        db_path = str(tmp_path / "test.db")
        reset_connection()

        # First call
        init_schema(db_path)
        # Second call — should not raise
        try:
            init_schema(db_path)
        except Exception as e:
            pytest.fail(f"init_schema raised unexpectedly: {e}")
        reset_connection()

    def test_standard_columns_structure(self):
        """verify STANDARD_COLUMNS is a list of 4-tuples with expected fields."""
        assert isinstance(STANDARD_COLUMNS, list)
        assert len(STANDARD_COLUMNS) == 6
        for col in STANDARD_COLUMNS:
            assert isinstance(col, tuple)
            assert len(col) == 4
            assert isinstance(col[0], str)  # name
            assert isinstance(col[1], str)  # description
            assert col[2].startswith("#")  # color
            assert isinstance(col[3], int)  # sort_order
