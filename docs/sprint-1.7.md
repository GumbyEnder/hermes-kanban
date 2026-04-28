# Sprint 1.7 — Token & Cost Analytics

**Goal:** `hermes kanban usage` analytics command group — visibility into LLM token spend and cost trends per board/card.

**Deliverable:** `usage` subcommand with `summary`, `report`, `heatmap` sub-sub-commands, backed by `usage_events` table + `usage.py` stats module.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| `hermes kanban usage summary` | shows total tokens, cost, and per-model breakdown for selected time window |
| `hermes kanban usage report --by board` | aggregates spend by board; top cards by token count |
| `hermes kanban usage heatmap --days 7` | ASCII heatmap (day/hour) of LLM activity volume |
| `record_usage()` callable from agent | agent instrumentation hook available |
| Tests cover all SQL queries | 100% query path coverage |

---

## Q1 Planning Block

**Epic:** Cost awareness & operational observability
**Tasks:**

1. **Design** — `usage_events` schema (model, prompt, completion, cost, timestamp, optional card/board linkage)
2. **Database** — Add `usage_events` table + `record_usage_event()` function in `database.py`
3. **Usage module** — `usage.py`: aggregation queries: cost_by_model(), tokens_by_board(), activity_heatmap()
4. **CLI** — Add `@kanban.group()` → `usage` with subcommands: `summary`, `report`, `heatmap`
5. **Agent hook** — Outline instrumentation pattern; add `record_usage()` accessible from Hermes agent
6. **Tests** — fixtures with sample usage rows; assert report totals, heatmap buckets

**Out of Scope (future sprints):**
* Realtime TUI cost meter
* Per-card token burn displayed inline
* Automated budget alerts
