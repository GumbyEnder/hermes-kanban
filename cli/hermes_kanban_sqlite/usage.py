"""
Usage analytics module — cost & token reporting for Kanban boards.

Functions operate on a SQLite database (same file as kanban data).
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from .database import get_connection

__all__ = [
    "get_cost_summary",
    "get_token_report",
    "get_activity_heatmap",
    "get_top_cards_by_tokens",
    "get_board_spend",
]


def get_cost_summary(
    db_path: str,
    days: int = 30,
    board_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Return total cost, token counts, and per-model breakdown for last N days."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    start = (datetime.utcnow() - timedelta(days=days)).isoformat()
    end = datetime.utcnow().isoformat()

    where_clause = "timestamp >= ? AND timestamp <= ?"
    params = [start, end]
    if board_id is not None:
        where_clause += " AND (board_id = ? OR card_id IN (SELECT id FROM cards WHERE board_id = ?))"
        params.extend([board_id, board_id])

    query = f"""
        SELECT
            model,
            SUM(cost) as cost,
            SUM(prompt_tokens) as prompt_tokens,
            SUM(completion_tokens) as completion_tokens,
            COUNT(*) as events
        FROM usage_events
        WHERE {where_clause}
        GROUP BY model
        ORDER BY cost DESC
    """
    cursor.execute(query, params)
    rows = cursor.fetchall()

    summary = {
        "total_events": 0,
        "total_prompt_tokens": 0,
        "total_completion_tokens": 0,
        "total_cost": 0.0,
        "by_model": {},
    }
    for r in rows:
        model = r["model"]
        if model is None:
            continue
        summary["by_model"][model] = {
            "events": r["events"] or 0,
            "prompt_tokens": r["prompt_tokens"] or 0,
            "completion_tokens": r["completion_tokens"] or 0,
            "cost": r["cost"] or 0.0,
        }
        summary["total_events"] += r["events"] or 0
        summary["total_prompt_tokens"] += r["prompt_tokens"] or 0
        summary["total_completion_tokens"] += r["completion_tokens"] or 0
        summary["total_cost"] += r["cost"] or 0.0

    return summary


def get_token_report(
    db_path: str,
    group_by: str = "board",
    days: int = 30,
) -> List[Dict[str, Any]]:
    """Group usage events and return structured report."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    start = (datetime.utcnow() - timedelta(days=days)).isoformat()
    end = datetime.utcnow().isoformat()

    if group_by == "board":
        query = """
            SELECT
                b.id as board_id,
                b.name as board_name,
                SUM(ue.cost) as cost,
                SUM(ue.prompt_tokens) as prompt_tokens,
                SUM(ue.completion_tokens) as completion_tokens,
                COUNT(ue.id) as events
            FROM usage_events ue
            LEFT JOIN boards b ON ue.board_id = b.id
            WHERE ue.timestamp >= ? AND ue.timestamp <= ?
            GROUP BY b.id
            ORDER BY cost DESC
        """
        cursor.execute(query, [start, end])
    elif group_by == "card":
        query = """
            SELECT
                c.id as card_id,
                c.title as card_title,
                b.name as board_name,
                SUM(ue.cost) as cost,
                SUM(ue.prompt_tokens) as prompt_tokens,
                SUM(ue.completion_tokens) as completion_tokens,
                COUNT(ue.id) as events
            FROM usage_events ue
            LEFT JOIN cards c ON ue.card_id = c.id
            LEFT JOIN boards b ON c.board_id = b.id
            WHERE ue.timestamp >= ? AND ue.timestamp <= ?
            GROUP BY c.id
            ORDER BY cost DESC
            LIMIT 50
        """
        cursor.execute(query, [start, end])
    elif group_by == "model":
        query = """
            SELECT
                model,
                SUM(cost) as cost,
                SUM(prompt_tokens) as prompt_tokens,
                SUM(completion_tokens) as completion_tokens,
                COUNT(*) as events
            FROM usage_events
            WHERE timestamp >= ? AND timestamp <= ?
            GROUP BY model
            ORDER BY cost DESC
        """
        cursor.execute(query, [start, end])
    elif group_by == "day":
        query = """
            SELECT
                DATE(timestamp) as day,
                SUM(cost) as cost,
                SUM(prompt_tokens) as prompt_tokens,
                SUM(completion_tokens) as completion_tokens,
                COUNT(*) as events
            FROM usage_events
            WHERE timestamp >= ? AND timestamp <= ?
            GROUP BY DATE(timestamp)
            ORDER BY day DESC
        """
        cursor.execute(query, [start, end])
    else:
        raise ValueError(f"Unsupported group_by: {group_by}")

    return [dict(row) for row in cursor.fetchall()]


def get_activity_heatmap(
    db_path: str,
    days: int = 7,
) -> List[Dict[str, Any]]:
    """Return hourly activity buckets for the last N days."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    start = (datetime.utcnow() - timedelta(days=days)).isoformat()
    end = datetime.utcnow().isoformat()

    query = """
        SELECT
            DATE(timestamp) as day,
            CAST(strftime('%H', timestamp) AS INTEGER) as hour,
            COUNT(*) as events,
            SUM(cost) as cost,
            SUM(prompt_tokens) as prompt_tokens
        FROM usage_events
        WHERE timestamp >= ? AND timestamp <= ?
        GROUP BY DATE(timestamp), strftime('%H', timestamp)
        ORDER BY day ASC, hour ASC
    """
    cursor.execute(query, [start, end])
    return [dict(row) for row in cursor.fetchall()]


def get_top_cards_by_tokens(
    db_path: str,
    limit: int = 10,
    days: int = 30,
) -> List[Dict[str, Any]]:
    """Return top N cards by total token consumption within the time window."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    start = (datetime.utcnow() - timedelta(days=days)).isoformat()
    end = datetime.utcnow().isoformat()

    query = """
        SELECT
            c.id as card_id,
            c.title as card_title,
            b.name as board_name,
            SUM(ue.prompt_tokens + ue.completion_tokens) as total_tokens,
            SUM(ue.cost) as total_cost,
            COUNT(ue.id) as events
        FROM usage_events ue
        JOIN cards c ON ue.card_id = c.id
        JOIN boards b ON c.board_id = b.id
        WHERE ue.timestamp >= ? AND ue.timestamp <= ?
        GROUP BY c.id
        ORDER BY total_tokens DESC
        LIMIT ?
    """
    cursor.execute(query, [start, end, limit])
    return [dict(row) for row in cursor.fetchall()]


def get_board_spend(db_path: str, board_id: int) -> Dict[str, Any]:
    """Return cost & token stats for a single board (includes per-card breakdown)."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM boards WHERE id = ?", [board_id])
    board = cursor.fetchone()
    if not board:
        raise ValueError(f"Board {board_id} not found")

    cursor.execute("""
        SELECT
            SUM(cost) as total_cost,
            SUM(prompt_tokens) as total_prompt,
            SUM(completion_tokens) as total_completion,
            COUNT(*) as events
        FROM usage_events
        WHERE board_id = ?
    """, [board_id])
    totals = dict(cursor.fetchone())

    cursor.execute("""
        SELECT
            c.id, c.title, SUM(ue.cost) as cost, SUM(ue.prompt_tokens+ue.completion_tokens) as tokens
        FROM usage_events ue
        JOIN cards c ON ue.card_id = c.id
        WHERE ue.board_id = ?
        GROUP BY c.id
        ORDER BY cost DESC
    """, [board_id])
    cards = [dict(r) for r in cursor.fetchall()]

    return {
        "board_name": board["name"],
        "totals": totals,
        "cards": cards,
    }

