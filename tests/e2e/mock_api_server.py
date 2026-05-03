#!/usr/bin/env python3
"""
Mock Obsidian REST API Server for E2E Testing

Implements the hermes-kanban-bridge plugin's REST API (port 27124)
using only Python stdlib (http.server). No external dependencies.

Matches the API spec from docs/API.md (v1.2.0).

Usage:
    python3 tests/e2e/mock_api_server.py [--port PORT]
"""
import json
import sys
import time
import threading
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# ── In-memory store ─────────────────────────────────────────────────────

boards: dict[str, dict] = {}  # board_id -> {title, path, columns, cards}
next_card_id = 1


def _make_card_id(board_id: str, column: str, title: str) -> str:
    return f"{board_id}::{column}::{title}"


def _ensure_board(board_id: str):
    """Lazy-create a board if it doesn't exist."""
    if board_id not in boards:
        title = board_id.replace("Kanban/", "").replace(".md", "")
        boards[board_id] = {
            "id": board_id,
            "title": title,
            "path": board_id,
            "columns": ["Backlog", "To Do", "In Progress", "Review", "Done"],
            "cards": [],
        }


def _build_card_dict(card: dict, board_id: str) -> dict:
    """Build the API response format for a card."""
    result = {
        "id": card["id"],
        "title": card["title"],
        "column": card["column"],
        "boardId": board_id,
        "checked": card.get("checked", False),
    }
    for k in ("priority", "dueDate", "tags", "blocked", "blockerReason", "description"):
        if k in card and card[k] is not None:
            result[k] = card[k]
    return result


# ── Request Handler ─────────────────────────────────────────────────────

class MockKanbanHandler(BaseHTTPRequestHandler):
    """Handles ALL /health, /boards, /cards, /query, /ritual, /notify endpoints."""

    def log_message(self, format, *args):
        """Suppress default stderr logging — keep test output clean."""
        pass

    def _send_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def _parse_path(self) -> tuple[str, list[str]]:
        parsed = urllib.parse.urlparse(self.path)
        return parsed.path, parsed.path.strip("/").split("/")

    def do_OPTIONS(self):
        self._send_json({}, 200)

    # ── Health ───────────────────────────────────────────────────────

    def _handle_health(self):
        self._send_json({"ok": True, "status": "running", "port": self.server.server_port, "version": "1.2.0"})

    # ── Boards ───────────────────────────────────────────────────────

    def _handle_list_boards(self):
        board_list = [
            {"id": b["id"], "title": b["title"], "path": b["path"], "cardCount": len(b["cards"])}
            for b in boards.values()
        ]
        self._send_json({"ok": True, "boards": board_list})

    def _handle_get_board(self, board_id: str):
        decoded = urllib.parse.unquote(board_id)
        if decoded not in boards:
            self._send_json({"ok": False, "error": f"Board not found: {decoded}"}, 404)
            return
        board = boards[decoded]
        self._send_json({"ok": True, "board": {
            "id": board["id"],
            "title": board["title"],
            "path": board["path"],
            "columns": board["columns"],
            "cards": [_build_card_dict(c, decoded) for c in board["cards"]],
        }})

    def _handle_create_board(self, body: dict):
        title = body.get("title", "Untitled")
        board_folder = body.get("boardFolder", "Kanban")
        columns = body.get("columns", ["Backlog", "To Do", "In Progress", "Review", "Done"])
        template = body.get("template")

        if template:
            templates = {
                "default": ["Backlog", "To Do", "In Progress", "Review", "Done"],
                "sprint": ["Backlog", "Sprint Backlog", "In Progress", "Code Review", "Done"],
                "bug-triage": ["Reported", "Triaged", "In Progress", "QA Testing", "Closed"],
                "release": ["Planned", "Ready", "In Progress", "Staging", "Released"],
                "personal": ["Inbox", "Today", "This Week", "Waiting", "Done"],
            }
            if template in templates:
                columns = templates[template]

        safe_title = title.replace(" ", "-")
        board_id = f"{board_folder}/{safe_title}.md"

        if board_id in boards:
            self._send_json({"ok": False, "error": f"Board already exists: {board_id}"}, 409)
            return

        boards[board_id] = {
            "id": board_id,
            "title": title,
            "path": board_id,
            "columns": columns,
            "cards": [],
        }
        self._send_json({"ok": True, "board": boards[board_id]})

    # ── Cards ─────────────────────────────────────────────────────────

    def _handle_create_card(self, body: dict):
        global next_card_id
        board_id = body.get("boardId", "")
        column = body.get("column", "To Do")
        title = body.get("title", "Untitled Card")

        _ensure_board(board_id)

        card = {
            "id": f"{board_id}::{column}::{title}",
            "title": title,
            "column": column,
            "checked": False,
            "priority": body.get("priority"),
            "dueDate": body.get("dueDate"),
            "tags": body.get("tags", []),
            "blocked": body.get("blocked", False),
            "blockerReason": body.get("blockerReason"),
            "description": body.get("description", ""),
        }
        boards[board_id]["cards"].append(card)
        self._send_json({"ok": True, "card": _build_card_dict(card, board_id)})

    def _handle_update_card(self, card_id: str, body: dict):
        decoded = urllib.parse.unquote(card_id)
        # card_id format: boardPath::column::title
        parts = decoded.split("::")
        if len(parts) < 3:
            self._send_json({"ok": False, "error": f"Invalid card ID: {decoded}"}, 400)
            return

        board_id = parts[0]
        column = parts[1]
        title = parts[2]

        _ensure_board(board_id)

        for card in boards[board_id]["cards"]:
            if card["title"] == title and card["column"] == column:
                for k, v in body.items():
                    if k in card:
                        card[k] = v
                self._send_json({"ok": True, "card": _build_card_dict(card, board_id)})
                return

        self._send_json({"ok": False, "error": f"Card not found: {decoded}"}, 404)

    def _handle_move_card(self, body: dict):
        card_id = body.get("cardId", "")
        to_column = body.get("toColumn", "")

        decoded = urllib.parse.unquote(card_id)
        parts = decoded.split("::")
        if len(parts) < 3:
            self._send_json({"ok": False, "error": f"Invalid card ID: {decoded}"}, 400)
            return

        board_id = parts[0]
        old_column = parts[1]
        title = parts[2]

        _ensure_board(board_id)

        for card in boards[board_id]["cards"]:
            if card["title"] == title and card["column"] == old_column:
                card["column"] = to_column
                self._send_json({"ok": True, "card": _build_card_dict(card, board_id)})
                return

        self._send_json({"ok": False, "error": f"Card not found: {decoded}"}, 404)

    # ── Query ─────────────────────────────────────────────────────────

    def _handle_query(self, query_params: dict):
        board_id = query_params.get("boardId")
        tag = query_params.get("tag")
        blocked = query_params.get("blocked")
        overdue = query_params.get("overdue")
        column = query_params.get("column")

        results = []
        for bid, board in boards.items():
            if board_id and bid != board_id:
                continue
            for card in board["cards"]:
                if column and card["column"] != column:
                    continue
                if tag and tag not in card.get("tags", []):
                    continue
                if blocked == "true" and not card.get("blocked"):
                    continue
                if overdue == "true":
                    due = card.get("dueDate", "")
                    if not due or due >= time.strftime("%Y-%m-%d"):
                        continue
                results.append(_build_card_dict(card, bid))

        self._send_json({"ok": True, "cards": results, "count": len(results)})

    # ── Rituals ────────────────────────────────────────────────────────

    def _handle_standup(self, body: dict):
        board_id = body.get("boardId")
        in_progress = []
        blocked_cards = []
        due_soon = []

        for bid, board in boards.items():
            if board_id and bid != board_id:
                continue
            for card in board["cards"]:
                if card["column"] == "In Progress":
                    in_progress.append(card["title"])
                if card.get("blocked"):
                    blocked_cards.append(card["title"])
                due = card.get("dueDate", "")
                if due and due <= time.strftime("%Y-%m-%d"):
                    due_soon.append(card["title"])

        self._send_json({
            "ok": True,
            "inProgress": in_progress,
            "blocked": blocked_cards,
            "dueSoon": due_soon,
            "summary": f"Standup: {len(in_progress)} in progress, {len(blocked_cards)} blocked, {len(due_soon)} due soon.",
        })

    def _handle_review(self, body: dict):
        board_id = body.get("boardId")
        completed = []
        carryover = []
        blocked_cards = []

        for bid, board in boards.items():
            if board_id and bid != board_id:
                continue
            for card in board["cards"]:
                if card["column"] == "Done" and card.get("checked"):
                    completed.append(card["title"])
                elif card["column"] != "Done":
                    carryover.append(card["title"])
                if card.get("blocked"):
                    blocked_cards.append(card["title"])

        self._send_json({
            "ok": True,
            "completed": completed,
            "carryOver": carryover,
            "blocked": blocked_cards,
            "velocityCount": len(completed),
            "summary": f"Review: {len(completed)} completed, {len(carryover)} carry-over.",
        })

    # ── Due notifications ─────────────────────────────────────────────

    def _handle_notify_due(self):
        overdue = []
        for bid, board in boards.items():
            for card in board["cards"]:
                due = card.get("dueDate", "")
                if due and due < time.strftime("%Y-%m-%d"):
                    overdue.append({"id": card["id"], "title": card["title"], "dueDate": due})

        self._send_json({"ok": True, "overdue": overdue, "notified": []})

    # ── Templates ─────────────────────────────────────────────────────

    def _handle_templates(self):
        templates = {
            "default": {"name": "default", "columns": ["Backlog", "To Do", "In Progress", "Review", "Done"], "description": "Standard kanban workflow"},
            "sprint": {"name": "sprint", "columns": ["Backlog", "Sprint Backlog", "In Progress", "Code Review", "Done"], "description": "Agile sprint"},
            "bug-triage": {"name": "bug-triage", "columns": ["Reported", "Triaged", "In Progress", "QA Testing", "Closed"], "description": "Bug tracking"},
            "release": {"name": "release", "columns": ["Planned", "Ready", "In Progress", "Staging", "Released"], "description": "Release pipeline"},
            "personal": {"name": "personal", "columns": ["Inbox", "Today", "This Week", "Waiting", "Done"], "description": "Personal productivity"},
        }
        self._send_json({"ok": True, "templates": list(templates.values())})

    # ── Router ─────────────────────────────────────────────────────────

    def do_GET(self):
        path, parts = self._parse_path()

        if path == "/health":
            self._handle_health()
        elif path == "/boards":
            self._handle_list_boards()
        elif len(parts) == 2 and parts[0] == "boards":
            self._handle_get_board(parts[1])
        elif path == "/query":
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            flat = {k: v[0] for k, v in query.items()}
            self._handle_query(flat)
        elif path == "/notify/due":
            self._handle_notify_due()
        elif path == "/templates":
            self._handle_templates()
        elif len(parts) == 2 and parts[0] == "templates":
            self._send_json({"ok": True, "template": {"name": parts[1], "columns": ["Backlog", "To Do", "Done"], "description": parts[1]}})
        else:
            self._send_json({"ok": False, "error": f"GET {path} not found"}, 404)

    def do_POST(self):
        path, parts = self._parse_path()
        body = self._read_body()

        if path == "/boards":
            self._handle_create_board(body)
        elif path == "/cards":
            self._handle_create_card(body)
        elif path == "/cards/move":
            self._handle_move_card(body)
        elif path == "/ritual/standup":
            self._handle_standup(body)
        elif path == "/ritual/review":
            self._handle_review(body)
        elif path == "/templates/apply":
            self._handle_create_board(body)
        else:
            self._send_json({"ok": False, "error": f"POST {path} not found"}, 404)

    def do_PUT(self):
        path, parts = self._parse_path()
        body = self._read_body()

        if len(parts) == 2 and parts[0] == "cards":
            self._handle_update_card(parts[1], body)
        else:
            self._send_json({"ok": False, "error": f"PUT {path} not found"}, 404)


# ── Server Runner ───────────────────────────────────────────────────────

def start_server(port: int = 27124, daemon: bool = False) -> HTTPServer:
    """Start the mock server. Returns the server instance."""
    server = HTTPServer(("127.0.0.1", port), MockKanbanHandler)

    if daemon:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        time.sleep(0.1)  # Give it time to bind
    else:
        print(f"Mock Kanban API running on http://127.0.0.1:{port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

    return server


if __name__ == "__main__":
    port = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--port" else 27124
    start_server(port, daemon=False)