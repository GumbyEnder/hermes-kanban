# Native Hermes Provider — Adapter Contract

**Status:** Proposed v2 foundation  
**Repository:** [GumbyEnder/hermes-kanban](https://github.com/GumbyEnder/hermes-kanban)  
**Last updated:** 2026-07-29

## Purpose

`hermes-kanban` originally treated Obsidian Markdown Kanban boards as the task engine and exposed them to Hermes through a local REST bridge.

Hermes now provides a durable native Kanban engine with its own task database, dispatcher, dependencies, worker runs, task comments, attachments, recovery, CLI, gateway commands, and dashboard.

This document defines a provider architecture that lets the Obsidian plugin become a **human workspace for native Hermes execution** without duplicating task state.

> **Native Hermes Kanban owns execution state. Obsidian supplies bounded context, human controls, decisions, and durable knowledge capture.**

## Goals

1. Render native Hermes tasks and board state in Obsidian.
2. Dispatch native Hermes tasks from notes, headings, selections, and attachments.
3. Give humans safe controls: comment, approve, unblock, retry/reclaim, reassign, and inspect results.
4. Create durable links between project knowledge and task execution.
5. Preserve a standalone Markdown-board provider for users who do not use native Hermes Kanban.
6. Avoid bidirectional Markdown card/status synchronization.

## Non-goals

- Reimplement Hermes task scheduling, worker spawning, task claiming, retries, dependencies, or artifact storage.
- Make Markdown cards a second source of execution truth.
- Automatically export an entire vault as task context.
- Expose unauthenticated control endpoints on a LAN or WAN.
- Remove legacy Markdown boards in v2.

## Provider model

```ts
export type ExecutionProviderKind = 'legacy-markdown' | 'hermes-native';

export interface ExecutionProvider {
  readonly kind: ExecutionProviderKind;
  health(): Promise<ProviderHealth>;
  listBoards(query?: BoardQuery): Promise<ExecutionBoard[]>;
  getBoard(boardId: string, query?: BoardQuery): Promise<ExecutionBoard>;
  getTask(taskId: string): Promise<ExecutionTask>;
  createTask(input: CreateTaskInput): Promise<ExecutionTask>;
  updateTask(taskId: string, patch: TaskPatch): Promise<ExecutionTask>;
  addComment(taskId: string, comment: TaskCommentInput): Promise<TaskComment>;
  addLink(input: TaskLinkInput): Promise<void>;
  removeLink(input: TaskLinkInput): Promise<void>;
  listProfiles(): Promise<ExecutionProfile[]>;
  dispatch(options?: DispatchOptions): Promise<DispatchResult>;
}
```

### Legacy Markdown provider

The existing parser/server implementation becomes `LegacyMarkdownProvider`:

- board = Markdown file
- card = Markdown checkbox line
- status = column/check state
- local server = existing Obsidian HTTP bridge

It remains supported for offline/standalone users, but is explicitly documented as a separate execution mode.

### Native Hermes provider

`HermesNativeProvider` maps the contract to the official native Hermes Kanban board/task model:

- board = native Hermes board slug
- task = native Hermes task ID
- status = `triage | todo | ready | running | blocked | done | archived`
- links = native parent/child dependency links
- comments = native task comments
- result / runs / artifacts = native task/run records

The provider must not emulate native execution behavior in Obsidian.

## Required native operations

| Provider operation | Native Hermes capability |
|---|---|
| List boards | `hermes kanban boards list` / board API |
| Read board | Native dashboard board endpoint |
| Read task | `hermes kanban show <id>` / task API |
| Create task | `hermes kanban create` / `kanban_create` |
| Update task | `hermes kanban edit`, assign, block, unblock, complete, archive / task PATCH |
| Comment | `hermes kanban comment` / `kanban_comment` |
| Dependency | `hermes kanban link` and `unlink` / `kanban_link` |
| Attach sources | `hermes kanban attach` / native task attachment API |
| Dispatch nudge | `hermes kanban dispatch` / dashboard dispatch endpoint |
| Worker history | `hermes kanban runs`, `log`, `tail` |
| Profiles | `hermes kanban assignees` / dashboard profiles endpoint |

## Connection and authentication

### Local-first mode — v2.0 target

The default supported deployment is Obsidian and Hermes on the same trusted host.

- Prefer a documented Hermes-native local API or CLI JSON adapter.
- Do not depend on undocumented dashboard implementation details as the only contract.
- Connection settings are explicit: provider kind, endpoint/command, selected board, timeout.
- The plugin must show connection health and a last-successful-sync timestamp.

### Remote mode — future, authenticated only

Remote Hermes execution requires an explicit authenticated channel.

Supported designs to evaluate:

1. Hermes gateway/API server with scoped bearer token.
2. Tailscale-only endpoint plus application-layer authentication.
3. User-run local companion process that forwards a narrow authenticated provider protocol.

Not allowed:

- Calling a dashboard plugin API that has no network authentication.
- Binding an Obsidian REST bridge to all interfaces by default.
- Storing long-lived plaintext credentials in a note.

## Normalized data model

```ts
export interface ExecutionBoard {
  id: string;              // native slug or legacy board path
  name: string;
  description?: string;
  icon?: string;
  tasks: ExecutionTask[];
  updatedAt?: string;
}

export interface ExecutionTask {
  id: string;
  boardId: string;
  title: string;
  body?: string;
  status: 'triage' | 'todo' | 'ready' | 'running' | 'blocked' | 'done' | 'archived';
  assignee?: string;
  priority?: number | string;
  tenant?: string;
  createdAt?: string;
  updatedAt?: string;
  scheduledAt?: string;
  blocker?: string;
  result?: string;
  parentIds: string[];
  childIds: string[];
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
  latestRun?: TaskRun;
}

export interface TaskRun {
  id: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  logPath?: string;
}
```

Unknown fields returned by a provider must be preserved in an `extensions` object rather than discarded; native Hermes will evolve faster than the plugin.

## Context packet schema

Dispatch from Obsidian must be explicit and previewable.

```ts
export interface ContextPacket {
  version: 1;
  source: {
    vaultName?: string;
    notePath?: string;
    noteUri?: string;
    heading?: string;
    selection?: string;
  };
  notes: ContextNote[];
  attachments: ContextAttachment[];
  acceptanceCriteria?: string;
  constraints?: string;
  estimatedTextBytes: number;
}

export interface ContextNote {
  path: string;
  title?: string;
  excerpt?: string;
  inclusion: 'current-note' | 'selection' | 'linked-note' | 'manual';
}
```

### Dispatch UX requirements

Before creating a task, the plugin displays:

- task title and native board
- assignee, model/skill/workspace/dependency choices
- every included note, excerpt, file, and attachment
- estimated text size and attachment size
- acceptance criteria and constraints

The user can remove any source before dispatch.

The plugin sends only user-approved context. It does not crawl the entire vault or recursively attach links by default.

## Obsidian-facing primitives

### Task block

```markdown
```hermes-task
id: t_abc123
mode: compact
```
```

The renderer displays native state, assignee, latest event, blocker, dependency progress, result, and a dashboard deep link.

### Board block

```markdown
```hermes-board
board: product-alpha
filter: active
```
```

This is a read-through native board query, not a Markdown board mirror.

### Approval callout

```markdown
> [!hermes-approval]
> Task: t_abc123
> Decision: Approve release
> Options: approve | reject | request-revision
```

A decision appends a structured native task comment. If configured, approval can unblock a blocked task; arbitrary task movement is never implied by checking a Markdown checkbox.

### Outcome capture

A task can append a compact result to a designated note section:

```markdown
## Hermes execution log

- **Task:** `t_abc123`
- **Status:** done
- **Verified:** 2026-07-29
- **Result:** …
- **Artifacts:** …
```

The plugin must append a bounded block and never rewrite surrounding human prose.

## Offline and caching behavior

- Cache the last successful provider response locally with a fetch timestamp.
- Render stale state visibly: `Last refreshed 14 minutes ago — provider offline`.
- Disable mutations while the provider is unavailable.
- Never queue hidden write operations without an explicit user choice.
- Legacy Markdown mode remains fully usable without Hermes connectivity.

## Migration and compatibility

### Existing Markdown boards

v2 offers three explicit paths:

1. **Stay legacy** — existing behavior continues unchanged.
2. **Import once** — create native tasks from selected Markdown cards; write native IDs into optional task-reference blocks, not card-column sync metadata.
3. **Archive snapshot** — preserve completed Markdown boards as project history and begin native execution for future work.

No automatic bidirectional sync is offered.

### Existing plugin REST API

- Keep the v1 REST bridge available under Legacy Markdown mode.
- Version the provider API separately from the old REST surface.
- Mark v1 docs as legacy after native provider reaches beta; do not remove them without a migration release.

## Security requirements

1. Local-first default.
2. Explicit user confirmation for dispatch context and task mutations.
3. No secrets in note body, task body, or plugin settings beyond secure local credential storage.
4. Remote provider requires authentication and transport security.
5. Dashboard deep links must not leak task body or attachment paths into third-party URLs.
6. Provider errors should be human-readable but redact credentials and sensitive paths where configured.

## Acceptance tests

### Provider contract
- Native board/task data maps deterministically to normalized objects.
- Native status changes are visible in task blocks without a page reload when provider events are available.
- Provider failures leave cached views readable and mutations disabled.

### Dispatch
- A selection-derived task contains only the previewed packet.
- Linked notes are not included unless selected.
- Attachment paths resolve to native task attachments.
- User cancellation creates no task.

### Governance
- Approval appends one native comment and one vault decision record.
- Unblock/retry/reassign use native Hermes operations.
- Worker results append only within a configured execution-log boundary.

### Compatibility
- Legacy Markdown board tests remain green.
- Native provider can coexist with legacy boards in one vault.
- Missing native Hermes service produces a clear setup/help state.

## Implementation sequence

1. Add provider interfaces and `LegacyMarkdownProvider` adapter without changing behavior.
2. Add read-only `HermesNativeProvider`: health, boards, task detail, normalized mapping, cache state.
3. Add task and board render blocks.
4. Add contextual dispatch with preview-only mode, then native task creation.
5. Add comments/unblock/reassign and approval callouts.
6. Add result capture and execution journal.
7. Add authenticated remote transport only after local mode is stable.

## Open questions

1. What stable, documented native Hermes API should the provider target: CLI JSON, gateway API, or a purpose-built service endpoint?
2. Should a local companion process be part of the plugin package or a separate optional Hermes integration package?
3. How should native event streaming be exposed to Obsidian: WebSocket, polling, or local event relay?
4. What is the minimal permission model for a shared household/team vault?
5. Which migration path should the installer recommend by default?

## Success condition

A person can use Obsidian to construct a bounded execution context, dispatch and govern native Hermes work, see current state in the relevant notes, and preserve completed outcomes as reusable knowledge — while Hermes remains the sole execution-state authority.
