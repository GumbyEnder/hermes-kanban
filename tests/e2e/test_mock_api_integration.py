"""
Layer 3 — Mock API Integration Tests

Starts the mock Obsidian REST API server (tests/e2e/mock_api_server.py)
and exercises every documented endpoint from docs/API.md.

Tests the full REST API surface without needing a running Obsidian instance.
"""
import json
import time
import threading
import urllib.request
import urllib.error
import pytest
from http.server import HTTPServer

from tests.e2e.mock_api_server import MockKanbanHandler, start_server, boards

MOCK_PORT = 27125  # Use different port to avoid conflicting with real plugin
BASE_URL = f"http://127.0.0.1:{MOCK_PORT}"


def _api(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    """Make an HTTP request to the mock server. Returns (status_code, response_dict)."""
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None

    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            return resp.status, result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {"error": body}


class TestMockAPIIntegration:
    """Integration tests against the mock REST API server."""

    @classmethod
    def setup_class(cls):
        """Start mock server once for the class."""
        # Clear state
        boards.clear()
        cls.server = HTTPServer(("127.0.0.1", MOCK_PORT), MockKanbanHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.2)

    @classmethod
    def teardown_class(cls):
        """Shutdown mock server."""
        cls.server.shutdown()
        cls.thread.join(timeout=2)

    # ── Health ──────────────────────────────────────────────────

    def test_health(self):
        status, data = _api("GET", "/health")
        assert status == 200
        assert data["ok"] is True
        assert data["status"] == "running"
        assert data["port"] == MOCK_PORT

    # ── Boards CRUD ─────────────────────────────────────────────

    def test_create_board(self):
        status, data = _api("POST", "/boards", {
            "title": "E2E Test Board",
            "columns": ["Backlog", "To Do", "In Progress", "Done"],
        })
        assert status == 200
        assert data["ok"] is True
        assert data["board"]["title"] == "E2E Test Board"
        assert "Backlog" in data["board"]["columns"]

    def test_create_board_duplicate(self):
        _api("POST", "/boards", {"title": "Dup Board"})
        status, data = _api("POST", "/boards", {"title": "Dup Board"})
        assert status == 409
        assert data["ok"] is False

    def test_create_board_from_template(self):
        status, data = _api("POST", "/boards", {
            "title": "Sprint Demo",
            "template": "sprint",
        })
        assert status == 200
        assert data["ok"] is True
        assert "Sprint Backlog" in data["board"]["columns"]

    def test_list_boards(self):
        # Ensure at least one board exists
        _api("POST", "/boards", {"title": "List Test"})
        status, data = _api("GET", "/boards")
        assert status == 200
        assert data["ok"] is True
        assert len(data["boards"]) >= 1

    def test_get_board_by_id(self):
        # Create then fetch
        res = _api("POST", "/boards", {"title": "Fetch Me"})
        board_id = res[1]["board"]["id"]
        encoded = board_id.replace("/", "%2F")

        status, data = _api("GET", f"/boards/{encoded}")
        assert status == 200
        assert data["board"]["title"] == "Fetch Me"

    def test_get_nonexistent_board(self):
        status, data = _api("GET", "/boards/Nonexistent.md")
        assert status == 404
        assert data["ok"] is False

    # ── Cards CRUD ──────────────────────────────────────────────

    def test_create_card(self):
        res = _api("POST", "/boards", {"title": "Card Board"})
        board_id = res[1]["board"]["id"]

        status, data = _api("POST", "/cards", {
            "boardId": board_id,
            "column": "To Do",
            "title": "Test Card",
            "priority": "high",
            "tags": ["urgent", "backend"],
        })
        assert status == 200
        assert data["ok"] is True
        assert data["card"]["title"] == "Test Card"
        assert "urgent" in data["card"]["tags"]

    def test_update_card(self):
        res = _api("POST", "/boards", {"title": "Update Board"})
        board_id = res[1]["board"]["id"]

        _api("POST", "/cards", {
            "boardId": board_id, "column": "To Do", "title": "Update Me"
        })

        card_id = f"{board_id}::To Do::Update Me"
        encoded = card_id.replace("/", "%2F").replace(" ", "%20")

        status, data = _api("PUT", f"/cards/{encoded}", {
            "priority": "low",
            "dueDate": "2026-06-15",
        })
        assert status == 200
        assert data["card"]["priority"] == "low"
        assert data["card"]["dueDate"] == "2026-06-15"

    def test_move_card(self):
        res = _api("POST", "/boards", {"title": "Move Board"})
        board_id = res[1]["board"]["id"]

        _api("POST", "/cards", {
            "boardId": board_id, "column": "To Do", "title": "Move Me"
        })

        card_id = f"{board_id}::To Do::Move Me"
        status, data = _api("POST", "/cards/move", {
            "cardId": card_id,
            "toColumn": "In Progress",
        })
        assert status == 200
        assert data["card"]["column"] == "In Progress"

    # ── Query ───────────────────────────────────────────────────

    def test_query_by_board(self):
        res = _api("POST", "/boards", {"title": "Query Board"})
        board_id = res[1]["board"]["id"]

        _api("POST", "/cards", {
            "boardId": board_id, "column": "To Do", "title": "Query Card",
            "tags": ["backend"],
        })

        status, data = _api("GET", f"/query?boardId={board_id}")
        assert status == 200
        assert data["count"] >= 1

    def test_query_by_tag(self):
        status, data = _api("GET", "/query?tag=backend")
        assert status == 200
        assert data["count"] >= 1
        for card in data["cards"]:
            assert "backend" in card.get("tags", [])

    def test_query_blocked(self):
        res = _api("POST", "/boards", {"title": "Blocked Board"})
        board_id = res[1]["board"]["id"]

        _api("POST", "/cards", {
            "boardId": board_id, "column": "To Do", "title": "Blocked Card",
            "blocked": True, "blockerReason": "Waiting for design",
        })

        status, data = _api("GET", "/query?blocked=true")
        assert status == 200
        assert data["count"] >= 1

    def test_query_overdue(self):
        res = _api("POST", "/boards", {"title": "Overdue Board"})
        board_id = res[1]["board"]["id"]

        _api("POST", "/cards", {
            "boardId": board_id, "column": "To Do", "title": "Overdue Card",
            "dueDate": "2020-01-01",
        })

        status, data = _api("GET", "/query?overdue=true")
        assert status == 200
        assert data["count"] >= 1

    # ── Rituals ─────────────────────────────────────────────────

    def test_standup(self):
        status, data = _api("POST", "/ritual/standup", {})
        assert status == 200
        assert data["ok"] is True
        assert "inProgress" in data
        assert "blocked" in data
        assert "summary" in data

    def test_review(self):
        status, data = _api("POST", "/ritual/review", {})
        assert status == 200
        assert data["ok"] is True
        assert "completed" in data
        assert "carryOver" in data
        assert "summary" in data

    # ── Notifications ───────────────────────────────────────────

    def test_notify_due(self):
        status, data = _api("GET", "/notify/due")
        assert status == 200
        assert data["ok"] is True
        assert "overdue" in data

    # ── Templates ───────────────────────────────────────────────

    def test_list_templates(self):
        status, data = _api("GET", "/templates")
        assert status == 200
        assert data["ok"] is True
        assert len(data["templates"]) == 5

    def test_get_template(self):
        status, data = _api("GET", "/templates/sprint")
        assert status == 200
        assert data["ok"] is True
        assert data["template"]["name"] == "sprint"

    def test_apply_template(self):
        status, data = _api("POST", "/templates/apply", {
            "title": "Template Board",
            "template": "bug-triage",
        })
        assert status == 200
        assert "QA Testing" in data["board"]["columns"]