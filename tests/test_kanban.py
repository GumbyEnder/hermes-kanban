"""Tests for the kanban business logic module."""
import pytest
import sqlite3
from hermes_kanban_sqlite.database import init_schema, get_connection, reset_connection, STANDARD_COLUMNS
from hermes_kanban_sqlite.kanban import (
    KanbanError,
    create_board,
    list_boards,
    get_board,
    create_card,
    get_card,
    list_cards,
    update_card,
    archive_card,
    delete_card,
    add_comment,
    add_dependency,
    get_dependencies,
    create_column,
    get_all_columns,
    SQLiteDatabase,
)


@pytest.fixture(autouse=True)
def reset_db():
    """Reset connection pool before and after each test."""
    reset_connection()
    yield
    reset_connection()


def _setup_db(tmp_path, db_name="test.db"):
    """Helper: initialize a fresh DB with schema and return db_path."""
    db_path = str(tmp_path / db_name)
    reset_connection()
    init_schema(db_path)
    return db_path


class TestCreateBoard:

    def test_create_board(self, tmp_path):
        """creates board, returns ID > 0."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Test Board")
        assert isinstance(board_id, int)
        assert board_id > 0

    def test_create_board_duplicate(self, tmp_path):
        """raises KanbanError on duplicate name."""
        db_path = _setup_db(tmp_path)
        create_board(db_path, "Duplicate Board")
        with pytest.raises(KanbanError, match="already exists"):
            create_board(db_path, "Duplicate Board")


class TestListGetBoard:

    def test_list_boards(self, tmp_path):
        """returns list after creating 2 boards."""
        db_path = _setup_db(tmp_path)
        create_board(db_path, "Board A")
        create_board(db_path, "Board B")
        boards = list_boards(db_path)
        assert len(boards) == 2
        names = {b["name"] for b in boards}
        assert names == {"Board A", "Board B"}

    def test_get_board_exists(self, tmp_path):
        """returns dict with correct name."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Existing Board")
        board = get_board(db_path, board_id)
        assert board is not None
        assert board["name"] == "Existing Board"

    def test_get_board_not_found(self, tmp_path):
        """returns None for non-existent board."""
        db_path = _setup_db(tmp_path)
        board = get_board(db_path, 9999)
        assert board is None


class TestCreateCard:

    def test_create_card(self, tmp_path):
        """creates card, returns ID, card appears in list."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Card Test Board")
        card_id = create_card(db_path, board_id, "Test Card", "To Do")
        assert isinstance(card_id, int)
        assert card_id > 0

        cards = list_cards(db_path)
        assert len(cards) == 1
        assert cards[0]["title"] == "Test Card"

    def test_create_card_duplicate_title(self, tmp_path):
        """raises KanbanError on duplicate title."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Duplicate Card Board")
        create_card(db_path, board_id, "Unique Card", "To Do")
        with pytest.raises(KanbanError, match="already exists"):
            create_card(db_path, board_id, "Unique Card", "To Do")


class TestGetCardWithTags:

    def test_get_card_with_tags(self, tmp_path):
        """card with tags returned in dict."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Tags Test Board")
        card_id = create_card(db_path, board_id, "Card With Tags", "To Do",
                              tags=["urgent", "frontend"])
        card = get_card(db_path, card_id)
        assert card is not None
        assert "tags" in card
        tag_names = [t["name"] for t in card["tags"]]
        assert "urgent" in tag_names
        assert "frontend" in tag_names


class TestListCardsFiltered:

    def test_list_cards_filtered_by_column(self, tmp_path):
        """filter works correctly."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Filter Test Board")
        create_card(db_path, board_id, "Card 1", "To Do")
        create_card(db_path, board_id, "Card 2", "In Progress")
        create_card(db_path, board_id, "Card 3", "Done")

        todo_cards = list_cards(db_path, column_name="To Do")
        assert len(todo_cards) == 1
        assert todo_cards[0]["title"] == "Card 1"

        progress_cards = list_cards(db_path, column_name="In Progress")
        assert len(progress_cards) == 1
        assert progress_cards[0]["title"] == "Card 2"


class TestUpdateCard:

    def test_update_card_move_column(self, tmp_path):
        """card moves, returns True."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Update Test Board")
        card_id = create_card(db_path, board_id, "Moveable Card", "To Do")

        result = update_card(db_path, card_id, board_id, column_name="In Progress")
        assert result is True

        card = get_card(db_path, card_id)
        assert card["column_name"] == "In Progress"

    def test_update_card_no_changes(self, tmp_path):
        """returns False when no changes are made."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "No Change Test Board")
        card_id = create_card(db_path, board_id, "Static Card", "To Do")

        result = update_card(db_path, card_id, board_id)
        assert result is False


class TestArchiveDelete:

    def test_archive_card(self, tmp_path):
        """status becomes 'archived', query excludes it."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Archive Test Board")
        card_id = create_card(db_path, board_id, "To Be Archived", "To Do")

        result = archive_card(db_path, card_id)
        assert result is True

        # Card should not appear in active list
        cards = list_cards(db_path)
        titles = [c["title"] for c in cards]
        assert "To Be Archived" not in titles

    def test_delete_card(self, tmp_path):
        """hard delete works."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Delete Test Board")
        card_id = create_card(db_path, board_id, "To Be Deleted", "To Do")

        result = delete_card(db_path, card_id)
        assert result is True

        card = get_card(db_path, card_id)
        assert card is None


class TestAddComment:

    def test_add_comment(self, tmp_path):
        """comment created, returned by get_card."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Comment Test Board")
        card_id = create_card(db_path, board_id, "Commented Card", "To Do")

        comment_id = add_comment(db_path, card_id, "Tester", "This is a comment")
        assert isinstance(comment_id, int)
        assert comment_id > 0

        card = get_card(db_path, card_id)
        comments = card.get("comments", [])
        assert len(comments) == 1
        assert comments[0]["content"] == "This is a comment"
        assert comments[0]["author"] == "Tester"


class TestAddDependency:

    def test_add_dependency(self, tmp_path):
        """creates dependency, get_dependencies returns it."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Dependency Test Board")
        blocker_id = create_card(db_path, board_id, "Blocker Card", "To Do")
        blocked_id = create_card(db_path, board_id, "Blocked By Card", "To Do")

        dep_id = add_dependency(db_path, blocker_id, blocked_id)
        assert isinstance(dep_id, int)
        assert dep_id > 0

        deps = get_dependencies(db_path, blocked_id)
        assert len(deps["blockers"]) >= 1
        blocker_titles = [b["title"] for b in deps["blockers"]]
        assert "Blocker Card" in blocker_titles

    def test_add_dependency_self(self, tmp_path):
        """raises KanbanError on self-dependency."""
        db_path = _setup_db(tmp_path)
        board_id = create_board(db_path, "Self Dependency Test Board")
        card_id = create_card(db_path, board_id, "Self Card", "To Do")

        with pytest.raises(KanbanError, match="self-dependency"):
            add_dependency(db_path, card_id, card_id)


class TestGetAllColumns:

    def test_get_all_columns(self, tmp_path):
        """returns all columns after schema init (but before seeding)."""
        db_path = _setup_db(tmp_path)
        # Create a board so columns have a valid board_id FK
        board_id = create_board(db_path, "Test Board", "Test board for columns")
        # Columns table exists but is empty until seeded
        columns = get_all_columns(db_path)
        assert isinstance(columns, list)
        # Seed them manually for this test
        conn = get_connection(db_path)
        cursor = conn.cursor()
        for name, desc, color, order in STANDARD_COLUMNS:
            cursor.execute(
                "INSERT INTO columns (board_id, name, description, color, sort_order) VALUES (?, ?, ?, ?, ?)",
                (board_id, name, desc, color, order),
            )
        conn.commit()

        columns = get_all_columns(db_path)
        assert len(columns) == 6
        names = [c["name"] for c in columns]
        assert "Backlog" in names
        assert "Done" in names


class TestSQLiteDatabase:

    def test_context_manager(self, tmp_path):
        """enter/exit works, connection usable."""
        db_path = _setup_db(tmp_path)
        with SQLiteDatabase(db_path) as db:
            conn = db.connection
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            assert cursor.fetchone() is not None
        # Connection should be closed after exit (tracked by _closed flag)
        assert db._closed is True
