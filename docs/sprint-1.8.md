# Sprint 1.8 — BRAT Auto-Update Refinements

**Goal:** Polish the Obsidian sync experience — make bidirectional sync resilient, configurable, and conflict-aware.

**Deliverable:** Enhanced `sync.py` with auto-refresh interval, conflict detection, and improved two-way merge; `sync` CLI gains `--auto`, `--force`, `--dry-run` flags.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Conflict detection | Duplicate edits across SQLite & Obsidian produce warning + "dry-run" report |
| Auto-refresh | `--interval N` causes sync daemon to poll every N minutes (configurable) |
| Two-way merge | Card updates in Obsidian flow back into SQLite without overwrite |
| Tests | Conflict scenario (same card edited both sides) preserves both versions via merge strategy |

---

## Q1 Planning Block

**Epic:** Reliable Obsidian integration (BRAT = Bi-directional Real-time Atomic Transfer)
**Tasks:**

1. **Review current sync** — Read `sync.py` to understand existing Obsidian markdown parser + file writer
2. **Add conflict detection** — Compare `updated_at` timestamps; if both sides modified since last sync, flag
3. **Implement merge strategy** — Last-writer-wins (with manual review option); preserve conflicting edits in `.conflict` sidecar
4. **Configurable polling** — Background daemon mode: `--daemon --interval 5` re-syncs every 5 min
5. **CLI flags** — `--force` (overwrite), `--dry-run` (show changes), `--auto` (daemonize)
6. **Tests** — Mock dual-edit scenario; assert conflict file created; assert SQLite state consistent

**Dependencies:** Sprint 1.5 baseline (BRAT sync already works for one-way push)

---

## Notes

* Conflict resolution strategy should be user-configurable in future (keep both / pick SQLite / pick Obsidian)
* Auto-refresh interval stored in config (`~/.hermes/kanban/config.json`)
