"""
TUI (Terminal UI) Rendering Module — Interactive Kanban display.

Uses Textual for rich terminal rendering with:
- Column-based kanban layout (multi-board via board_id)
- Card hover/selection
- Keyboard: q quit, d archive, enter select, esc clear
- Keyboard: [ / ] cycle to previous/next board
"""
from __future__ import annotations

from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Static, Button, Header, Footer
from textual.binding import Binding
from textual.message import Message
from textual.screen import Screen
from pathlib import Path

from .kanban import (
    list_cards,
    get_card,
    update_card,
    archive_card,
    add_comment,
    get_all_columns,
    list_boards,
    get_board,
)

DEFAULT_DB = str(Path.home() / ".hermes" / "kanban.db")


class CardSelected(Message):
    """Posted when a card is selected."""

    def __init__(self, card_id: int, title: str) -> None:
        self.card_id = card_id
        self.title = title
        super().__init__()


class KanbanCard(Static):
    """A single kanban card in the TUI."""

    def __init__(self, card_id: int, title: str, column_name: str = "To Do",
                 tags: list | None = None, **kwargs) -> None:
        # Textual IDs: [a-zA-Z_-][a-zA-Z0-9_-]*
        safe_id = f"card-{card_id}"
        super().__init__(id=safe_id, **kwargs)
        self.card_id = card_id
        self.title = title
        self.column = column_name
        self.tags = tags or []

    def compose(self) -> ComposeResult:
        with Horizontal(classes="card-header"):
            yield Static(f"🎴 [{self.card_id}] {self.title}", classes="card-title")
        with Horizontal(classes="card-meta"):
            yield Static(self.column, classes="column-badge")
            if self.tags:
                tag_text = ", ".join(t["name"] for t in self.tags)
                yield Static(tag_text, classes="card-tags")


class KanbanColumn(Container):
    """A kanban column containing cards."""

    def __init__(self, name: str, description: str = "",
                 cards: list | None = None) -> None:
        super().__init__(id=f"column-{name.replace(' ', '-').lower()}")
        self.column_name = name
        self.description = description
        self._cards = cards or []

    def compose(self) -> ComposeResult:
        count = len(self._cards)
        yield Static(f"📂 {self.column_name} ({count})", classes="column-header")
        for card_data in self._cards:
            yield KanbanCard(
                card_id=card_data.get("id", 0),
                title=card_data.get("title", "Untitled"),
                column_name=self.column_name,
                tags=card_data.get("tags", []),
            )


class KanbanBoard(Screen):
    """Main kanban board screen (single board view)."""

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("d", "archive_card", "Archive Selected"),
        Binding("enter", "select_card", "Select Card"),
        Binding("escape", "clear_selection", "Clear Selection"),
        Binding("]", "next_board", "Next Board", priority=True),
        Binding("[", "prev_board", "Prev Board", priority=True),
    ]

    def __init__(self, db_path: str, board_id: int | None = None) -> None:
        super().__init__()
        self.db_path = db_path
        self.board_id: int | None = board_id
        self.selected_card_id: int | None = None
        self.boards: list[dict] = []  # cached board list for cycling

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(id="board-container"):
            yield Static("📋 Kanban Board", id="board-title", classes="title")
            with Horizontal(id="columns-row"):
                pass
        yield Footer()

    def on_mount(self) -> None:
        """Load board metadata, columns, and cards."""
        try:
            # Resolve board_id if not provided
            if self.board_id is None:
                boards = list_boards(self.db_path)
                if not boards:
                    self.notify("No boards found. Run 'init' first.", severity="warning")
                    return
                self.boards = boards
                self.board_id = boards[0]["id"]
            else:
                self.boards = list_boards(self.db_path)

            # Update title to current board name
            board = get_board(self.db_path, self.board_id)
            title_widget = self.query_one("#board-title", Static)
            if board:
                title_widget.update(f"📋 {board['name']}")

            # Render columns
            columns = get_all_columns(self.db_path, self.board_id)
            if not columns:
                self.notify("No columns defined.", severity="warning")
                return

            columns_row = self.query_one("#columns-row", Horizontal)
            for col in columns:
                cards = list_cards(
                    self.db_path,
                    board_id=self.board_id,
                    column_name=col["name"],
                    status="active",
                )
                column_widget = KanbanColumn(
                    name=col["name"],
                    description=col.get("description", ""),
                    cards=cards,
                )
                columns_row.mount(column_widget)

        except Exception as e:
            self.notify(f"Failed to load board: {e}", severity="error")

    def action_next_board(self) -> None:
        """Cycle to the next board (] key)."""
        if not self.boards:
            self.notify("No boards available", severity="warning")
            return
        # Find current index and advance
        current_idx = next((i for i, b in enumerate(self.boards) if b["id"] == self.board_id), 0)
        next_idx = (current_idx + 1) % len(self.boards)
        self.board_id = self.boards[next_idx]["id"]
        self._refresh_board()
        self.notify(f"Switched to board: {self.boards[next_idx]['name']}")

    def action_prev_board(self) -> None:
        """Cycle to the previous board ([ key)."""
        if not self.boards:
            self.notify("No boards available", severity="warning")
            return
        current_idx = next((i for i, b in enumerate(self.boards) if b["id"] == self.board_id), 0)
        prev_idx = (current_idx - 1) % len(self.boards)
        self.board_id = self.boards[prev_idx]["id"]
        self._refresh_board()
        self.notify(f"Switched to board: {self.boards[prev_idx]['name']}")

    def action_select_card(self) -> None:
        """Handle Enter key — select the focused card."""
        focused = self.focused
        if isinstance(focused, KanbanCard):
            self.selected_card_id = focused.card_id
            self.notify(f"Selected: [{focused.card_id}] {focused.title}")

    def action_clear_selection(self) -> None:
        """Handle Escape key — clear selection."""
        self.selected_card_id = None
        self.notify("Selection cleared.")

    def action_archive_card(self) -> None:
        """Handle 'd' key — archive the selected card."""
        if self.selected_card_id is None:
            self.notify("No card selected. Press Enter on a card first.", severity="warning")
            return
        try:
            ok = archive_card(self.db_path, self.selected_card_id, board_id=self.board_id)
            if ok:
                self.notify(f"Card {self.selected_card_id} archived.")
                self.selected_card_id = None
                self._refresh_board()
            else:
                self.notify(f"Failed to archive card {self.selected_card_id}.", severity="error")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")

    def _refresh_board(self) -> None:
        """Reload columns and cards for the current board."""
        columns_row = self.query_one("#columns-row", Horizontal)
        columns_row.remove_children()

        # Refresh title
        board = get_board(self.db_path, self.board_id)
        title_widget = self.query_one("#board-title", Static)
        if board:
            title_widget.update(f"📋 {board['name']}")

        # Re-render columns
        columns = get_all_columns(self.db_path, self.board_id)
        for col in columns:
            cards = list_cards(
                self.db_path,
                board_id=self.board_id,
                column_name=col["name"],
                status="active",
            )
            column_widget = KanbanColumn(name=col["name"], description=col.get("description", ""), cards=cards)
            columns_row.mount(column_widget)


class KanbanApp(App):
    """Main Textual app for Kanban TUI."""

    TITLE = "Hermes Kanban SQLite"
    CSS = """
    #board-container {
        height: 100%;
        padding: 1;
    }
    #board-title {
        text-align: center;
        text-style: bold;
        padding: 1 0;
    }
    #columns-row {
        height: 1fr;
    }
    .column-header {
        text-style: bold;
        padding: 1 0;
    }
    .card-header {
        padding: 0 1;
    }
    .card-title {
        width: 1fr;
    }
    .card-meta {
        padding: 0 1;
    }
    .column-badge {
        color: $text-muted;
    }
    .card-tags {
        color: $accent;
    }
    KanbanColumn {
        width: 1fr;
        border: solid $border;
        margin: 0 1;
        padding: 1;
        height: 100%;
    }
    KanbanCard {
        border: solid $border;
        margin: 1 0;
        padding: 1;
    }
    KanbanCard:focus {
        border: solid $accent;
    }
    """

    def __init__(self, db_path: str | None = None, board_id: int | None = None) -> None:
        super().__init__()
        self._db_path = db_path or DEFAULT_DB
        self._board_id = board_id

    def on_mount(self) -> None:
        self.push_screen(KanbanBoard(self._db_path, board_id=self._board_id))


def run_tui(db_path: str | None = None, board_id: int | None = None) -> None:
    """Launch the TUI application."""
    app = KanbanApp(db_path, board_id)
    app.run()
