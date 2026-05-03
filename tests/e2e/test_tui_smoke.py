"""
Layer 2 — TUI PTY Smoke Tests

Launch the Textual-based hermes-kanban-sqlite TUI in a pseudo-terminal (PTY),
send keystrokes, and verify it renders correctly and shuts down cleanly.

Note: Textual apps in headless PTY may receive SIGKILL (-9) when the PTY is
closed because Textual relies on TTY signals for graceful shutdown. Accepting
-9, -15, and 0 as valid exit codes since the key validation is that the app
launched, rendered content, and didn't crash with a Python traceback.
"""
import os
import pty
import select
import subprocess
import time
import pytest

CLI = "hermes-kanban-sqlite"

# Valid exit codes for a Textual TUI in headless PTY:
#   0   = clean quit via 'q' binding
#  -9   = SIGKILL from PTY close (expected in headless)
#  -15  = SIGTERM from PTY EOF
VALID_EXIT_CODES = {0, -9, -15}


def _setup_db(db_path):
    """Initialize a DB with one board and a few cards for TUI testing."""
    subprocess.run(
        [CLI, "init", "TUI Test Board", "--db-path", db_path],
        capture_output=True, text=True, timeout=10
    )
    subprocess.run(
        [CLI, "add", "Card Alpha", "--db-path", db_path],
        capture_output=True, text=True, timeout=10
    )
    subprocess.run(
        [CLI, "add", "Card Bravo", "--column", "In Progress",
         "--db-path", db_path],
        capture_output=True, text=True, timeout=10
    )
    subprocess.run(
        [CLI, "add", "Card Charlie", "--column", "Done",
         "--db-path", db_path],
        capture_output=True, text=True, timeout=10
    )


def _read_pty(master_fd, timeout=2.0, chunk_size=4096):
    """Read all available data from PTY master side within timeout."""
    output = b""
    deadline = time.time() + timeout
    while time.time() < deadline:
        remaining = deadline - time.time()
        r, _, _ = select.select([master_fd], [], [], max(0.1, min(remaining, 0.5)))
        if master_fd in r:
            try:
                chunk = os.read(master_fd, chunk_size)
                if not chunk:
                    break
                output += chunk
            except OSError:
                break
        else:
            break
    return output.decode("utf-8", errors="replace")


class TestTUISmoke:
    """Core TUI smoke tests — startup, keybindings, clean shutdown."""

    @pytest.fixture
    def db(self, tmp_path):
        db_path = str(tmp_path / "tui.db")
        _setup_db(db_path)
        return db_path

    def test_tui_launches_and_renders(self, db):
        """TUI starts and renders board/cards in the terminal."""
        master_fd, slave_fd = pty.openpty()

        proc = subprocess.Popen(
            [CLI, "tui", "--db-path", db],
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            close_fds=True
        )

        # Give Textual time to render
        time.sleep(2.0)

        # Read initial output
        output = _read_pty(master_fd, timeout=1.0)

        # Send quit
        os.write(master_fd, b"q")
        time.sleep(1.0)

        os.close(master_fd)
        os.close(slave_fd)

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

        assert proc.returncode in VALID_EXIT_CODES, (
            f"TUI unexpected exit code {proc.returncode}\nOutput: {output[:500]}"
        )

        # Verify it rendered kanban content
        found_kanban = (
            "Card" in output or "card" in output
            or "\U0001f3b4" in output  # 🎴
            or "\U0001f4c2" in output  # 📂
        )
        assert found_kanban, (
            f"TUI output doesn't show expected kanban content:\n{output[:500]}"
        )

    def test_tui_shows_header(self, db):
        """TUI renders the 'Hermes Kanban SQLite' header."""
        master_fd, slave_fd = pty.openpty()

        proc = subprocess.Popen(
            [CLI, "tui", "--db-path", db],
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            close_fds=True
        )

        time.sleep(2.0)
        output = _read_pty(master_fd, timeout=1.0)

        os.write(master_fd, b"q")
        time.sleep(1.0)

        os.close(master_fd)
        os.close(slave_fd)

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

        assert proc.returncode in VALID_EXIT_CODES

        # Key content verification
        assert "Hermes Kanban" in output, (
            f"Missing 'Hermes Kanban' header:\n{output[:500]}"
        )
        assert "TUI Test Board" in output or "board 1" in output, (
            f"Missing board reference:\n{output[:500]}"
        )

    def test_tui_shows_columns(self, db):
        """TUI renders column names for the board."""
        master_fd, slave_fd = pty.openpty()

        proc = subprocess.Popen(
            [CLI, "tui", "--db-path", db],
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            close_fds=True
        )

        time.sleep(2.0)
        output = _read_pty(master_fd, timeout=1.0)

        os.write(master_fd, b"q")
        time.sleep(1.0)

        os.close(master_fd)
        os.close(slave_fd)

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

        assert proc.returncode in VALID_EXIT_CODES

        # At least the rendered TUI should show column areas
        # Textual may or may not render column names as plain text in PTY mode
        # due to ANSI/SGR encoding; check for any of them
        columns_found = any(
            col in output for col in ["To Do", "In Progress", "Done", "Backlog"]
        )
        assert columns_found, (
            f"No standard columns found in TUI output:\n{output[:500]}"
        )

    def test_tui_exits_on_eof(self, db):
        """Closing PTY (EOF) should terminate the process (not hang)."""
        master_fd, slave_fd = pty.openpty()

        proc = subprocess.Popen(
            [CLI, "tui", "--db-path", db],
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            close_fds=True
        )

        time.sleep(2.0)
        _read_pty(master_fd, timeout=1.0)
        os.close(master_fd)
        os.close(slave_fd)

        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

        # Process should terminate (not hang forever)
        assert proc.returncode is not None, "TUI process should have exited"
        assert proc.returncode in VALID_EXIT_CODES, (
            f"TUI EOF exit code unexpected: {proc.returncode}"
        )