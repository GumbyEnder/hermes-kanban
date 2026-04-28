# Sprint 1.6 — Hermes CLI Kanban Commands

**Goal:** Expose the full hermes-kanban-sqlite feature set as native `hermes kanban <subcommand>` commands via a Hermes agent plugin.

**Deliverable:** Plugin installed at `~/.hermes/hermes-agent/plugins/kanban-cli/`; `hermes kanban --help` shows 11 subcommands (init, list, add, move, info, comment, dependency, archive, tui, sync, demo).

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Plugin discovery | `hermes` process loads `kanban-cli` plugin on startup |
| Command routing | `hermes kanban add "Fix bug"` → `python -m hermes_kanban_sqlite.cli add "Fix bug"` |
| All 11 subcommands | init, list, add, move, info, comment, dependency, archive, tui, sync, demo |
| Entry point | `pyproject.toml` contains `[project.entry-points."hermes_agent.plugins"]` |

---

## Q1 Planning Block

**Epic:** Hermes-native CLI surface
**Tasks:**

1. **Plugin scaffold** — `plugin.yaml` + `__init__.py` with `register(ctx)` function
2. **Command bridge** — Each `hermes kanban <subcmd>` proxies to `sys.executable -m hermes_kanban_sqlite.cli <subcmd>` (guaranteed feature parity)
3. **Entry point registration** — Add `kanban = "hermes_kanban_sqlite.hermes_plugin:register"` to `pyproject.toml`
4. **Editable install** — `pip3 install -e .` into agent venv (`~/.hermes/hermes-agent/venv`)
5. **Agent restart & verify** — `hermes kanban --help` works; test end-to-end init → add → list
6. **Version control** — Keep plugin source in repo at `cli/hermes_kanban_sqlite/hermes_plugin.py`

**Assumptions:**
* Hermes agent venv is Python ≥3.11
* Plugin manager scans `hermes_agent.plugins` entry points at startup
* No need to re-implement business logic; delegation to existing CLI module is acceptable

---

## Completed Work

- ✅ Plugin files written (`plugin.yaml`, `__init__.py`)
- ✅ Entry point configured; Python version downgraded to ≥3.11
- ✅ Editable install succeeded (package rebuilt and installed)
- ⏳ Manual verification pending (agent restart)
