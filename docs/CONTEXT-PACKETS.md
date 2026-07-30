# Context Packets (v2 Preview)

## Purpose

A context packet is the explicit, reviewable input a human prepares before a future native Hermes task is dispatched from Obsidian.

This first implementation is **preview-only**. It does not call a native Hermes task creation endpoint, dispatch workers, or mutate execution state.

## Design rules

- Every source is explicit.
- No recursive vault crawl.
- Linked notes are not included automatically.
- Attachments are included only when explicitly selected.
- Sources can be removed before dispatch.
- Size estimates are deterministic and visible to the UI.
- The packet remains a portable TypeScript/JSON value.

## Data model

```ts
interface ContextPacket {
  version: 1;
  source: {
    notePath?: string;
    noteTitle?: string;
    heading?: string;
  };
  sources: ContextSource[];
  acceptanceCriteria?: string;
  constraints?: string;
}
```

A source has a stable `id`, a `kind`, optional path/title/excerpt, and optional attachment size.

Kinds:

- `current-note`
- `selection`
- `linked-note`
- `attachment`

## Preview flow

1. Start from a note, heading, or selection.
2. Build a packet from the selected material only.
3. Add individual linked notes or attachments deliberately.
4. Write acceptance criteria and constraints.
5. Review source list and text/attachment size estimates.
6. Remove anything not appropriate for the worker.
7. In a later v2 slice, explicitly approve native task creation.

## What this does not do yet

- It does not render an Obsidian modal.
- It does not create a native Hermes task.
- It does not upload attachments.
- It does not infer missing acceptance criteria.
- It does not access remote Hermes endpoints.

The boundary is intentional: a human can inspect exactly what would be sent before the plugin gains dispatch capability.

## Test coverage

The fixture test covers:

- note and selection source construction
- explicit source addition/removal
- deterministic text and attachment size estimation
- no implicit task-dispatch behavior

## Obsidian preview command

When **Native Hermes Kanban** is selected in plugin settings, run this command-palette action from an open Markdown note:

```text
Preview native Hermes task context from active note
```

The command includes:

- the active note path and title;
- selected editor text when present; otherwise the current heading/line label;
- human-entered acceptance criteria and constraints.

The modal shows every source, deterministic text/attachment estimates, and removal controls. **Save preview** only returns the reviewed packet locally and shows a confirmation notice. It does not call Hermes task creation, dispatch, upload, or any other mutation endpoint.

## Next slice

Add explicit linked-note and attachment selection controls to the preview modal. Native task creation follows only after the preview interaction is proven and reviewed.

## Related

- [Native Hermes Provider Contract](NATIVE-HERMES-PROVIDER.md)
- [Native Hermes Provider Spike](HERMES-NATIVE-PROVIDER-SPIKE.md)
- GitHub issue #13
.