# Native Hermes Provider — Integration Spike

**Issue:** #10  
**Status:** Decision complete  
**Date:** 2026-07-29

## Decision

`HermesNativeProvider` will use the **native Hermes Kanban dashboard plugin API** as its v2 local-first transport, behind a provider boundary and explicit compatibility guard.

It will **not** query `kanban.db` directly, scrape the dashboard UI, or use the legacy Obsidian bridge API as an intermediate store.

## Evidence

The installed native Hermes implementation has three relevant surfaces:

| Surface | Evidence | Assessment |
|---|---|---|
| CLI | `hermes kanban boards list --json` returns structured board metadata | Useful diagnostics/fallback; incomplete for rich task detail and live lifecycle data |
| Agent tools | `kanban_create`, `kanban_show`, `kanban_comment`, etc. | Correct worker-facing contract; not callable from a third-party Obsidian plugin without invoking an agent |
| Dashboard plugin API | `plugins/kanban/dashboard/plugin_api.py`, mounted at `/api/plugins/kanban/`; calls `hermes_cli.kanban_db` directly | Best existing human-client transport: board/task reads, task mutation, profiles, comments, links, attachments, runs, dispatch, worker inspection, and event WebSocket all share native state |

The dashboard API is explicitly a thin read/write layer over `kanban_db`; it does not invent an alternate task model. That preserves the central product rule: **native Hermes owns execution state.**

## Local-first transport

### Supported v2.0 topology

```text
Obsidian desktop plugin
        │ localhost HTTP + WebSocket
        ▼
Hermes dashboard / native Kanban plugin API
        │
        ▼
Native Hermes kanban.db + dispatcher
```

The provider’s settings include:

```ts
interface HermesNativeConnectionSettings {
  mode: 'local-dashboard';
  baseUrl: string;      // default http://127.0.0.1:<dashboard-port>
  board?: string;       // optional native board slug
  timeoutMs: number;    // default 5000
}
```

The plugin probes a health/capabilities endpoint at setup, then stores only the endpoint configuration and a last-successful-check timestamp.

### Important security constraint

The native dashboard documentation states that dashboard plugin routes are intentionally unauthenticated for a **localhost-bound dashboard**. Therefore:

- v2.0 must label this transport **Local trusted host only**.
- The provider must reject non-loopback URLs by default.
- A user may override the loopback guard only after an explicit high-friction warning.
- The plugin must not describe LAN/Tailscale use as supported until Hermes ships a documented scoped-auth transport.

## Read-only v2.0 slice

The first implementation is deliberately small:

1. Health / compatibility probe
2. List boards
3. Read board with tasks grouped by native status
4. Read task detail: comments, links, attachments, latest run/result, recent events
5. List profiles
6. Poll or subscribe to native task events when an officially stable event route is available
7. Render task and board blocks in Obsidian

No native writes in the first slice.

## v2.1 mutation slice

After read-only validation:

- create task from approved Obsidian context packet
- add comment
- attach selected local files / note export
- native dependency link/unlink
- unblock/reassign/retry/reclaim through native operations
- dispatch nudge

Each action must use a native Hermes endpoint and be visible in the native event/run history.

## Provider request mapping

| Provider method | Native API family | v2.0 |
|---|---|---|
| `health()` | plugin/dashboard health or capability probe | Yes |
| `listBoards()` | native board endpoints | Yes |
| `getBoard()` | native board endpoint | Yes |
| `getTask()` | `/tasks/:id` | Yes |
| `listProfiles()` | `/profiles` | Yes |
| `createTask()` | `/tasks` | v2.1 |
| `updateTask()` | `PATCH /tasks/:id` | v2.1 |
| `addComment()` | `/tasks/:id/comments` | v2.1 |
| `addLink()` | `/links` | v2.1 |
| `dispatch()` | `/dispatch` | v2.1 |

## Fixture strategy

The plugin must test provider mapping without a running Hermes instance.

Fixtures must include:

- board list response with zero and populated boards
- board response containing every native task status
- task detail response with comments, parent/child links, attachments, latest result, and run history
- profile roster response
- native API unavailable / malformed response / version mismatch response
- stale cache result

Tests assert:

- native statuses map without loss
- unknown native fields survive in `extensions`
- an unavailable provider renders cached state as stale and disables mutations
- loopback policy rejects unsafe default remote URLs

## Compatibility boundary

The dashboard plugin API is the strongest available native transport today, but it is a plugin-level surface rather than a separately versioned public Kanban SDK.

`HermesNativeProvider` therefore must:

1. isolate endpoint paths and payload mapping in one adapter module;
2. maintain fixture compatibility tests;
3. expose provider API/version diagnostics in Obsidian settings;
4. fall back to read-only CLI JSON only for limited diagnostics when dashboard routes are unavailable;
5. not promise remote support until a documented authenticated Hermes API exists.

## Legacy mode

`LegacyMarkdownProvider` remains unchanged and is selected explicitly. It continues to operate the existing Markdown board / Obsidian bridge workflow for standalone users.

No automatic migration or status synchronization is introduced.

## Follow-up implementation issue

The next engineering work is a fixture-backed read-only `HermesNativeProvider` skeleton plus embedded native task/board rendering. It should ship behind an experimental feature flag, leave legacy behavior untouched, and include a clearly visible local-only security label.

## Spike completion criteria

- [x] Native surfaces inventoried against the installed Hermes implementation
- [x] Preferred local transport chosen
- [x] Security boundary documented
- [x] CLI fallback classified as limited diagnostics only
- [x] Read-only scope and fixture strategy defined
- [x] Follow-up implementation issue created

## References

- [[NATIVE-HERMES-PROVIDER]]
- Native Hermes Kanban documentation: https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban
- Native implementation: `plugins/kanban/dashboard/plugin_api.py` in Hermes Agent
- Issue #10
