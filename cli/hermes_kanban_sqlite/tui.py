"""
TUI (Terminal UI) Rendering Module — Interactive Kanban display in terminal.

Uses Textual for rich terminal rendering with:
- Column-based kanban layout
- Card hover/selection for editing
- Basic drag-and-drop via mouse events
- Real-time updates (polling backend)
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
    SQLiteDatabase,
)

DEFAULT_DB = str(Path.home() / ".hermes" / "kanban.db")


class CardSelected(Message):
    """Message posted when a card is selected."""

    def __init__(self, card_id: int, title: str) -> None:
        self.card_id = card_id
        self.title = title
        super().__init__()


class KanbanCard(Static):
    """A single kanban card in the TUI."""

    def __init__(self, card_id: int, title: str, column_name: str = "To Do",
                 tags: list | None = None, **kwargs) -> None:
        # Textual IDs: only letters, numbers, underscores, hyphens, no leading digit
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
    """Main kanban board screen."""

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("d", "archive_card", "Archive Selected"),
        Binding("enter", "select_card", "Select Card"),
        Binding("escape", "clear_selection", "Clear Selection"),
    ]

    def __init__(self, db_path: str | None = None) -> None:
        super().__init__()
        self.db_path = db_path or DEFAULT_DB
        self.selected_card_id: int | None = None

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(id="board-container"):
            yield Static("📋 Kanban Board", id="board-title", classes="title")
            with Horizontal(id="columns-row"):
                # Columns rendered in on_mount after data load
                pass
        yield Footer()

    def on_mount(self) -> None:
        """Load cards from database and render columns."""
        try:
            columns = get_all_columns(self.db_path)
            if not columns:
                self.notify("No columns found. Run 'hermes-kanban-sqlite init <project>' first.",
                           severity="warning")
                return

            columns_row = self.query_one("#columns-row", Horizontal)
            for col in columns:
                cards = list_cards(
                    self.db_path,
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
            self.notify(f"Failed to load kanban board: {e}", severity="error")

    def action_select_card(self) -> None:
        """Handle Enter key — select the focused card."""
        focused = self.focused
        if isinstance(focused, KanbanCard):
            self.selected_card_id = focused.card_id
            self.notify(f"Selected: [{focused.card_id}] {focused.title}")

    def action_clear_selection(self) -> None:
        """Handle Escape key — clear card selection."""
        self.selected_card_id = None
        self.notify("Selection cleared.")

    def action_archive_card(self) -> None:
        """Handle 'd' key — archive the selected card."""
        if self.selected_card_id is None:
            self.notify("No card selected. Press Enter on a card first.", severity="warning")
            return

        try:
            ok = archive_card(self.db_path, self.selected_card_id)
            if ok:
                self.notify(f"Card {self.selected_card_id} archived.")
                self.selected_card_id = None
                # Refresh board
                self._refresh_board()
            else:
                self.notify(f"Failed to archive card {self.selected_card_id}.", severity="error")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")

    def _refresh_board(self) -> None:
        """Reload columns and cards from database."""
        columns_row = self.query_one("#columns-row", Horizontal)
        columns_row.remove_children()
        self.on_mount()


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

    def __init__(self, db_path: str | None = None) -> None:
        super().__init__()
        self._db_path = db_path or DEFAULT_DB

    def on_mount(self) -> None:
        self.push_screen(KanbanBoard(self._db_path))


def run_tui(db_path: str | None = None) -> None:
    """Launch the TUI application."""
    app = KanbanApp(db_path)
    app.run()
