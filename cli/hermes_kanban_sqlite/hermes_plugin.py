"""Hermes kanban CLI plugin — exposes `hermes kanban ...` commands.

Registers a new top-level 'kanban' subcommand under the Hermes CLI.
Each subcommand forwards its arguments to the installed hermes-kanban-sqlite
CLI (python -m hermes_kanban_sqlite.cli) to guarantee feature parity.

Usage:
    hermes kanban init <name>
    hermes kanban list --board <board>
    hermes kanban add <title> --board <board>
    ...
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Optional

# Path to the Python executable of the current Hermes agent venv.
# When Hermes loads this plugin, it's running inside hermes-agent's venv.
_AGENT_PYTHON = sys.executable


def _run_cli(subcmd: str, args: list[str]) -> int:
    """Invoke the hermes_kanban_sqlite CLI as a subprocess.

    Args:
        subcmd: The kanban subcommand name (init, list, add, ...).
        args: List of argument strings for that subcommand.

    Returns:
        Exit code from the subprocess.
    """
    cmd = [_AGENT_PYTHON, "-m", "hermes_kanban_sqlite.cli", subcmd] + args
    # Execute in the same process group; let stdio inherit so output is live.
    return subprocess.run(cmd).returncode


# ---------------------------------------------------------------------------
# Parser setup — called by Hermes plugin loader
# ---------------------------------------------------------------------------

def setup_kanban_parser(subparser: argparse.ArgumentParser) -> None:
    """Add 'hermes kanban' subcommand tree to the Hermes CLI."""
    # Top-level kanban options common to most subcommands
    subparser.add_argument(
        "--db",
        type=str,
        default=None,
        help="Path to the kanban SQLite database (default: ~/.hermes/kanban.db)",
    )

    subparsers = subparser.add_subparsers(dest="kanban_command", help="Kanban operation")

    # ------------------- init -------------------
    p_init = subparsers.add_parser(
        "init",
        help="Initialize the kanban database and create a new board",
        description="Initialize the SQLite database and create a new board with the standard workflow columns.",
    )
    p_init.add_argument(
        "name",
        help="Board name (e.g. project or sprint name)",
    )
    p_init.add_argument(
        "--description",
        default="",
        help="Optional board description",
    )
    p_init.set_defaults(func=cmd_init)

    # ------------------- list -------------------
    p_list = subparsers.add_parser(
        "list",
        help="List cards on a board",
        description="List cards, filterable by column, status, tag, etc.",
    )
    p_list.add_argument(
        "--board",
        required=True,
        help="Board name or ID",
    )
    p_list.add_argument(
        "--column",
        default=None,
        help="Filter by column name",
    )
    p_list.add_argument(
        "--archived",
        action="store_true",
        default=False,
        help="Include archived cards",
    )
    p_list.set_defaults(func=cmd_list)

    # ------------------- add --------------------
    p_add = subparsers.add_parser(
        "add",
        help="Add a new card",
        description="Create a new card on a board.",
    )
    p_add.add_argument(
        "title",
        help="Card title",
    )
    p_add.add_argument(
        "--board",
        required=True,
        help="Board name or ID",
    )
    p_add.add_argument(
        "--column",
        default=None,
        help="Column (default: To Do)",
    )
    p_add.add_argument(
        "--description",
        default="",
        help="Card description text",
    )
    p_add.add_argument(
        "--tag",
        action="append",
        default=[],
        help="Tag(s) to attach (repeatable)",
    )
    p_add.add_argument(
        "--due",
        default=None,
        help="Due date (YYYY-MM-DD)",
    )
    p_add.set_defaults(func=cmd_add)

    # ------------------- move -------------------
    p_move = subparsers.add_parser(
        "move",
        help="Move a card to a different column",
        description="Update the card's column on its board.",
    )
    p_move.add_argument(
        "card_id",
        type=int,
        help="Card ID (integer)",
    )
    p_move.add_argument(
        "target_column",
        help="Destination column name",
    )
    p_move.set_defaults(func=cmd_move)

    # ------------------- info -------------------
    p_info = subparsers.add_parser(
        "info",
        help="Show card details",
        description="Display a card's full metadata, tags, dependencies, and comments.",
    )
    p_info.add_argument(
        "card_id",
        type=int,
        help="Card ID",
    )
    p_info.set_defaults(func=cmd_info)

    # ------------------- comment -------------------
    p_comment = subparsers.add_parser(
        "comment",
        help="Add a comment to a card",
        description="Append a comment to the card's history.",
    )
    p_comment.add_argument(
        "card_id",
        type=int,
        help="Card ID",
    )
    p_comment.add_argument(
        "text",
        help="Comment text",
    )
    p_comment.add_argument(
        "--author",
        default="CLI User",
        help="Comment author name",
    )
    p_comment.set_defaults(func=cmd_comment)

    # ------------------- dependency ---------------
    p_dep = subparsers.add_parser(
        "dependency",
        help="Link two cards with a dependency",
        description="Create a dependency relationship: blocks_id blocks blocked_id.",
    )
    p_dep.add_argument(
        "blocks_id",
        type=int,
        help="Card ID that blocks another",
    )
    p_dep.add_argument(
        "blocked_id",
        type=int,
        help="Card ID that is blocked",
    )
    p_dep.set_defaults(func=cmd_dependency)

    # ------------------- archive -----------------
    p_archive = subparsers.add_parser(
        "archive",
        help="Archive completed cards",
        description="Archive cards that have been in Done for more than N days.",
    )
    p_archive.add_argument(
        "board",
        help="Board name or ID",
    )
    p_archive.add_argument(
        "--older-than",
        type=int,
        default=7,
        help="Days in Done before archiving (default: 7)",
    )
    p_archive.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Show what would be archived without changing anything",
    )
    p_archive.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="Skip confirmation prompt",
    )
    p_archive.set_defaults(func=cmd_archive)

    # ------------------- tui ----------------------
    p_tui = subparsers.add_parser(
        "tui",
        help="Launch interactive terminal UI",
        description="Open the Text-based User Interface for board manipulation with keyboard navigation.",
    )
    p_tui.add_argument(
        "--board",
        default=None,
        help="Board name or ID to display first",
    )
    p_tui.set_defaults(func=cmd_tui)

    # ------------------- sync ---------------------
    p_sync = subparsers.add_parser(
        "sync",
        help="Sync database to Obsidian markdown notes",
        description="Export the kanban board structure and cards to Obsidian markdown files.",
    )
    p_sync.add_argument(
        "--vault",
        required=True,
        help="Path to the Obsidian vault root",
    )
    p_sync.add_argument(
        "--board",
        default=None,
        help="Limit sync to a specific board",
    )
    p_sync.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Preview changes without writing files",
    )
    p_sync.set_defaults(func=cmd_sync)

    # ------------------- demo ---------------------
    p_demo = subparsers.add_parser(
        "demo",
        help="Seed a demo board with example cards",
        description="Create a sample board with three columns and nine demo cards.",
    )
    p_demo.add_argument(
        "--project",
        default="Hermes Demo",
        help="Project name for the demo board",
    )
    p_demo.add_argument(
        "--board",
        default=None,
        help="Explicit board name (defaults to project name)",
    )
    p_demo.add_argument(
        "--clear",
        action="store_true",
        default=False,
        help="Clear all existing data before seeding",
    )
    p_demo.set_defaults(func=cmd_demo)


# ---------------------------------------------------------------------------
# Handler implementations — each forwards to the underlying CLI via subprocess
# ---------------------------------------------------------------------------

def _maybe_add_db_flag(args: list[str], db_opt: Optional[str]) -> None:
    if db_opt:
        args.extend(["--db", db_opt])


def cmd_init(args: argparse.Namespace) -> None:
    """hermes kanban init <name> [--description TEXT] [--db PATH]"""
    cmd_args = [args.name]
    if args.description:
        cmd_args += ["--description", args.description]
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("init", cmd_args)
    if rc != 0:
        print(f"Error: init failed with exit code {rc}", file=sys.stderr)


def cmd_list(args: argparse.Namespace) -> None:
    """hermes kanban list --board BOARD [--column COL] [--archived] [--db PATH]"""
    cmd_args = ["--board", args.board]
    if args.column:
        cmd_args += ["--column", args.column]
    if args.archived:
        cmd_args.append("--archived")
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("list", cmd_args)
    if rc != 0:
        print(f"Error: list failed with exit code {rc}", file=sys.stderr)


def cmd_add(args: argparse.Namespace) -> None:
    """hermes kanban add <title> --board BOARD [--column COL] [--tag TAG]... [--due DATE] [--description TEXT] [--db PATH]"""
    cmd_args = [args.title, "--board", args.board]
    if args.column:
        cmd_args += ["--column", args.column]
    for tag in args.tag:
        cmd_args += ["--tag", tag]
    if args.due:
        cmd_args += ["--due", args.due]
    if args.description:
        cmd_args += ["--description", args.description]
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("add", cmd_args)
    if rc != 0:
        print(f"Error: add failed with exit code {rc}", file=sys.stderr)


def cmd_move(args: argparse.Namespace) -> None:
    """hermes kanban move <card_id> <target_column> [--db PATH]"""
    cmd_args = [str(args.card_id), args.target_column]
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("move", cmd_args)
    if rc != 0:
        print(f"Error: move failed with exit code {rc}", file=sys.stderr)


def cmd_info(args: argparse.Namespace) -> None:
    """hermes kanban info <card_id> [--db PATH]"""
    cmd_args = [str(args.card_id)]
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("info", cmd_args)
    if rc != 0:
        print(f"Error: info failed with exit code {rc}", file=sys.stderr)


def cmd_comment(args: argparse.Namespace) -> None:
    """hermes kanban comment <card_id> <text> [--author NAME] [--db PATH]"""
    cmd_args = [str(args.card_id), args.text]
    if args.author:
        cmd_args += ["--author", args.author]
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("comment", cmd_args)
    if rc != 0:
        print(f"Error: comment failed with exit code {rc}", file=sys.stderr)


def cmd_dependency(args: argparse.Namespace) -> None:
    """hermes kanban dependency <blocks_id> <blocked_id> [--db PATH]"""
    cmd_args = [str(args.blocks_id), str(args.blocked_id)]
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("dependency", cmd_args)
    if rc != 0:
        print(f"Error: dependency failed with exit code {rc}", file=sys.stderr)


def cmd_archive(args: argparse.Namespace) -> None:
    """hermes kanban archive <board> [--older-than DAYS] [--dry-run] [--force] [--db PATH]"""
    cmd_args = [args.board, "--older-than", str(args.older_than)]
    if args.dry_run:
        cmd_args.append("--dry-run")
    if args.force:
        cmd_args.append("--yes")  # map --force to skip confirmation
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("archive", cmd_args)
    if rc != 0:
        print(f"Error: archive failed with exit code {rc}", file=sys.stderr)


def cmd_tui(args: argparse.Namespace) -> None:
    """hermes kanban tui [--board BOARD] [--db PATH]"""
    cmd_args = []
    if args.board:
        cmd_args += ["--board", args.board]
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("tui", cmd_args)
    # TUI captures the terminal; on exit, propagate return code (should be 0)
    if rc != 0:
        print(f"Error: tui exited with code {rc}", file=sys.stderr)


def cmd_sync(args: argparse.Namespace) -> None:
    """hermes kanban sync --vault VAULT [--board BOARD] [--dry-run] [--db PATH]"""
    cmd_args = ["--vault-dir", args.vault]
    if args.board:
        cmd_args += ["--board", args.board]
    if args.dry_run:
        cmd_args.append("--dry-run")
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("sync", cmd_args)
    if rc != 0:
        print(f"Error: sync failed with exit code {rc}", file=sys.stderr)


def cmd_demo(args: argparse.Namespace) -> None:
    """hermes kanban demo [--project NAME] [--board BOARD] [--clear] [--db PATH]"""
    cmd_args = []
    if args.project:
        cmd_args += ["--project", args.project]
    if args.board:
        cmd_args += ["--board", args.board]
    if args.clear:
        cmd_args.append("--clear")
    if args.db:
        cmd_args += ["--db", args.db]
    rc = _run_cli("demo", cmd_args)
    if rc != 0:
        print(f"Error: demo failed with exit code {rc}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Plugin registration entry point
# ---------------------------------------------------------------------------

def register(ctx) -> None:
    """Hermes agent plugin API — called during startup.

    Args:
        ctx: PluginContext with `.register_cli_command(name, help, description,
            setup_fn, handler_fn)`.
    """
    ctx.register_cli_command(
        name="kanban",
        help="Manage tasks via a local SQLite-backed Kanban board",
        description=(
            "Full CLI suite for personal task and project tracking.  "
            "Subcommands: init, list, add, move, info, comment, dependency, "
            "archive, tui, sync, demo.  Backed by a SQLite database stored "
            "in ~/.hermes/kanban.db."
        ),
        setup_fn=setup_kanban_parser,
        handler_fn=_kanban_dispatcher,
    )


def _kanban_dispatcher(args: argparse.Namespace) -> None:
    """Top-level dispatch for `hermes kanban <subcommand>`."""
    # The .func attribute is set by each subparser via set_defaults.
    func = getattr(args, "func", None)
    if func:
        func(args)
    else:
        # No subcommand provided; print help-like message
        print("Usage: hermes kanban <command> [options]")
        print("       (run 'hermes kanban --help' for command list)")
