# Spec: Action Log

**Status**: Stable
**Last updated**: 2026-05-08

**Shipped**:

- 2026-05-09 — Every state-changing user action is recorded in a persistent action log; a history page shows recent entries most-recent-first with human-readable descriptions and entity links. (plan: references/plans/action-log.md)
- 2026-05-09 — Fragment metadata changes (ready status, aspect weights, note and reference attachments) are individually logged as single-intent entries. (plan: references/plans/entity-live-metadata-save.md)

---

## Outcome

Every significant user action in Maskor is recorded in a human-readable log. The log exists primarily for observability — the user can see what happened and when. During a session, common editing actions (fragment edits, sequence rearrangements) can also be undone and redone. The undo/redo stack is session-local and is dropped on server restart; the log file persists.

---

## Scope

### In scope

- Recording user-initiated actions as structured log entries
- A human-readable, persistent action log
- Undo: reversing the most recent undoable action
- Redo: re-applying an action that was just undone
- Which action types are undoable vs. logged-only

### Out of scope

- Arbitrary point-in-time rollback (time travel to any past state — not undo/redo)
- Collaborative conflict resolution or multi-user action merging
- Syncing the action log across devices
- Undoing external edits — Maskor does not own those writes
- Undoing export operations — export is read-only and produces no vault or DB state
- Automatic replay of the full log to reconstruct state from scratch (not a design goal)

> Undo/redo covers the immediate editing session. It is not a full version control system.

---

## Behavior

### Log entries

Each log entry records:

- **id** — uuid identifying the entry itself (used for deduping and future undo references).
- **type** — what kind of operation was performed, in `domain:verb` form (e.g. `fragment:created`, `aspect:renamed`).
- **timestamp** — ISO 8601 string, when the action occurred.
- **actor** — the source of the action: `user` (UI-triggered) or `system` (e.g. cascade side-effects, future automated maintenance).
- **target** — the entity affected: `{ type, uuid, key?, title? }`. The optional fields are denormalized snapshots for human-readable rendering — they may go stale after later renames, which is acceptable for an observability log.
- **payload** — descriptive metadata specific to the action type (no before/after state in v1; see _Payload depth_).
- **undoable** — boolean flag indicating whether this entry can in principle be reversed by Maskor. Recorded for future undo work; v1 has no undo path.

### Action types

The naming convention is `domain:verb`. The full v1 set:

| Type                             | Undoable | Notes                                                                                                             |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `fragment:created`               | No       | Undoing a create by moving the fragment to discarded is surprising; users discard explicitly                      |
| `fragment:edited`                | Yes      | User-initiated content-only save via the editor                                                                   |
| `fragment:updated`               | Yes      | Catch-all: multi-field or programmatic patch that doesn't fit a single-intent type. Payload: `{ changedFields }`. |
| `fragment:renamed`               | Yes      | Key change                                                                                                        |
| `fragment:discarded`             | Yes      | Undo restores the fragment to active                                                                              |
| `fragment:restored`              | Yes      | Undo discards the fragment again                                                                                  |
| `fragment:ready-status-changed`  | Yes      | Payload: `{ from: number, to: number }`                                                                           |
| `fragment:note-attached`         | Yes      | Payload: `{ noteKey: string }`                                                                                    |
| `fragment:note-detached`         | Yes      | Payload: `{ noteKey: string }`                                                                                    |
| `fragment:reference-attached`    | Yes      | Payload: `{ referenceKey: string }`                                                                               |
| `fragment:reference-detached`    | Yes      | Payload: `{ referenceKey: string }`                                                                               |
| `fragment:aspect-attached`       | Yes      | Payload: `{ aspectKey: string, weight: number }`                                                                  |
| `fragment:aspect-detached`       | Yes      | Payload: `{ aspectKey: string }`                                                                                  |
| `fragment:aspect-weight-changed` | Yes      | Payload: `{ aspectKey: string, from: number, to: number }`                                                        |
| `aspect:created`                 | Yes      | Undo removes the aspect                                                                                           |
| `aspect:description-edited`      | Yes      | User-initiated description-only save via the editor                                                               |
| `aspect:updated`                 | Yes      | Catch-all: multi-field or programmatic patch. Payload: `{ changedFields }`.                                       |
| `aspect:renamed`                 | Yes      | Key change; cascades through fragments are implicit (one log entry per rename, not per touched fragment)          |
| `aspect:deleted`                 | Yes      | Undo restores the aspect; orphaned fragment weights remain warnings                                               |
| `aspect:category-changed`        | Yes      | Payload: `{ from?: string, to?: string }` (optional because category is optional)                                 |
| `aspect:note-attached`           | Yes      | Payload: `{ noteKey: string }`                                                                                    |
| `aspect:note-detached`           | Yes      | Payload: `{ noteKey: string }`                                                                                    |
| `note:created`                   | Yes      |                                                                                                                   |
| `note:edited`                    | Yes      | User-initiated content-only save                                                                                  |
| `note:updated`                   | Yes      | Catch-all for programmatic content patches. Payload: `{ changedFields }`.                                         |
| `note:renamed`                   | Yes      | Key change; cascades through fragments and aspects are implicit                                                   |
| `note:deleted`                   | Yes      |                                                                                                                   |
| `reference:created`              | Yes      |                                                                                                                   |
| `reference:edited`               | Yes      | User-initiated content-only save                                                                                  |
| `reference:updated`              | Yes      | Catch-all for programmatic content patches. Payload: `{ changedFields }`.                                         |
| `reference:renamed`              | Yes      | Key change; cascades through fragments are implicit                                                               |
| `reference:deleted`              | Yes      |                                                                                                                   |
| `sequence:fragment-placed`       | Yes      | Defined for spec parity — sequencing API does not exist in v1                                                     |
| `sequence:fragment-moved`        | Yes      | Defined for spec parity — sequencing API does not exist in v1                                                     |

#### Cascade behavior

A rename cascades through related entities (e.g. renaming an aspect updates every fragment that uses it). The cascade produces **one** log entry — the originating `*:renamed` action — not one entry per touched fragment. This keeps the log readable and reflects user intent rather than mechanical side effects.

#### Out of scope for v1

- **System actions** (no entries): piece auto-conversion, prompt surfacing/acceptance/dismissal, project registration, fragment-opened reads. These may be added later under `actor: "system"`; not logged in v1.
- **External vault edits** are never logged. The action log only covers actions taken through the Maskor API.
- **File-import action** (importing an entire file that splits into multiple fragments) is deferred until the import flow itself exists. See `references/TODO.md`.

### Payload depth (v1)

Payloads are descriptive metadata only. No before/after content snapshots. Examples:

- `fragment:updated`: `{ changedFields: ["content"] }` (catch-all path)
- `aspect:renamed`: `{ oldKey, newKey }`
- `fragment:discarded`: `{}` (target carries the identifying info)
- `fragment:ready-status-changed`: `{ from: 0.2, to: 0.5 }` (scalar delta — see below)

**Scalar deltas exception**: the "no before/after" principle applies to content blobs. Scalar before/after values (`from`/`to`) are permitted on single-intent types where they are load-bearing for human-readable rendering and carry no risk of large payloads: `fragment:ready-status-changed`, `fragment:aspect-weight-changed`, `aspect:category-changed`. This is a deliberate small departure, not a slippery slope toward full snapshots.

**Cascade principle**: for relational changes (notes, references, aspects attached/detached), one log entry is emitted per element changed — e.g. attaching three aspects in one PATCH produces three `fragment:aspect-attached` entries. Rename cascades still produce one entry for the originating `*:renamed` action.

Adding full content before/after snapshots remains a future migration tied to undo/redo work.

### Undo / redo

The undo/redo system covers common editing actions where users expect it: fragment content and metadata edits, sequence rearrangements. It is not a full version control system — it does not cover every logged action type.

- Undo reverses the most recently undoable action and moves it onto the redo stack.
- Redo re-applies the most recently undone action and moves it back onto the undo stack.
- Any new user action clears the redo stack.
- Undo and redo operate on undoable entries only. Non-undoable entries are skipped silently.
- If an undo target was subsequently modified externally (e.g. the fragment was edited in Obsidian after the logged action), Maskor aborts the undo with a warning. It does not silently overwrite external edits.
- The stack is in-memory only. It is lost on server restart. This is acceptable — the log file is always preserved for inspection.
- A practical depth limit (e.g. 50 steps) should be imposed to bound memory use.

### Human-readable log

- The action log is written to a persistent, human-readable file: `<vault>/.maskor/action-log.jsonl` (newline-delimited JSON).
- Each line is a self-contained JSON object representing one log entry.
- The log is append-only. Maskor never modifies or removes past entries.
- The log is owned by Maskor. Users should not edit it directly, but they can read it.
- On rebuild or DB wipe, the log file is preserved — it is not re-derivable from vault files.

### Rotation

- The live `action-log.jsonl` is capped at `5000` entries.
- When the cap is reached the live file is renamed to `action-log.<ISO_timestamp>.jsonl` in the same directory and a new empty `action-log.jsonl` is started.
- Archives are not surfaced in the v1 UI but remain inspectable on disk.

### Frontend delivery

- The history page reads from a `GET /projects/:projectId/action-log?limit=N` endpoint that tail-reads the live file.
- After a successful state-changing API call, the frontend invalidates the action log query and re-fetches. No SSE channel is needed for action log entries in v1 — every entry originates from a Maskor-initiated mutation, so the client already knows when to refresh.
- External vault changes do not produce log entries, so the existing watcher SSE stream remains scoped to vault sync events as today.

### Failure handling

When a mutation succeeds but the subsequent log append fails, the entry must not be silently lost and the user's primary action must not be blocked.

The intended approach:

- The mutation response is **not** failed — the vault is canonical, the user's work is durable, and a logging hiccup should never produce a user-visible save error.
- The unwritten entry is preserved in a sidecar file `<vault>/.maskor/action-log.failed.jsonl` so it can be inspected and reconciled later.
- A low-key UI signal (e.g. a banner on the history page) informs the user that one or more recent actions could not be recorded.
- The structured logger emits an error-level event with full context.

**v1 ships a simpler stand-in**: the failure is logged via the structured logger only. No sidecar file, no UI surfacing. This is a knowing deviation from the spec for an initial implementation; closing the gap is tracked as a resilience suggestion in `references/suggestions.md`.

### Log display in UI

- The UI exposes a recent actions panel showing the last N entries, most recent first.
- Undoable entries are visually distinct from log-only entries.
- Undo and redo are accessible via keyboard shortcuts and from the action panel.

---

## Constraints

- The action log file lives in `<vault>/.maskor/` and is Maskor-managed. The watcher ignores it.
- Undo and redo are session-local in the first iteration — the undo stack is in memory and is lost on server restart. Persistence across restarts is a future concern.
- Maskor never undoes external Obsidian edits. The log only covers actions taken through the Maskor API.
- Log entries must be serializable. No function fields, no circular references.
- Every state-changing API operation must go through the command-pattern handler (see `packages/api/src/commands/`). The handler performs the mutation and appends the log entry as one unit.

---

## Prior decisions

- **Append-only log file**: The log is a plain `.jsonl` file in the vault. Human-readable, survives DB loss, inspectable without Maskor. Consistent with the vault-as-source-of-truth principle.
- **Log-first, undo-second**: The primary purpose of the action log is observability — knowing what happened. Undo/redo is a secondary feature built on top of the same log entries.
- **Undo stack is session-local**: Persisting undo state across restarts adds significant complexity and conflict risk (vault content may change while Maskor is offline). Session-scoped undo is the deliberate design, not a temporary limitation.
- **Non-undoable actions are still logged**: Logging is unconditional. The `undoable` flag marks what can be reversed, not what gets recorded.
- **Maskor does not undo external edits**: If a user edits a fragment in Obsidian, that change is not on the undo stack. Attempting to undo a previous Maskor edit of that fragment detects the conflict and warns — no silent overwrite.
- **FRAGMENT_CREATE is not undoable**: Undoing a create by moving the fragment to discarded is surprising. Users who create a fragment accidentally should discard it explicitly.

---

## Open questions

- [ ] 2026-04-27 — What is the undo depth limit? No limit, a fixed count (e.g. 50), or a size-based cap?
- [ ] 2026-04-27 — Should the undo stack survive server restarts in a future iteration? This requires persisting the stack to a file, which adds conflict risk if vault content changes while Maskor is offline.
- [ ] 2026-04-27 — How is the conflict case handled when an undo target was externally edited? Abort with warning? Apply partially? Let the user choose?
- [ ] 2026-04-27 — Should sequence rearrangements (drag-and-drop in the overview) be undoable as a batch ("undo last move") or individually per fragment?
- [ ] 2026-05-08 — Rotation threshold of 5000 entries is a starting guess. Revisit once usage data exists; consider time-based rotation as an alternative.
- [ ] 2026-05-08 — Log-append failure currently logs to the service logger only (v1 stand-in). When does the sidecar + UI banner approach land?

---

## Acceptance criteria

- Every user-initiated state-changing API operation produces exactly one log entry in `<vault>/.maskor/action-log.jsonl`. Cascade side-effects (e.g. fragments updated by an aspect rename) do not produce additional entries.
- Each entry uses the `domain:verb` action type naming and includes `id`, `timestamp`, `actor`, `target`, `payload`, `undoable`.
- The history page lists entries most-recent-first, grouped by day, with per-action human-readable rendering.
- After a successful mutation, the frontend invalidates the action log query and the new entry appears.
- The live log file rotates at 5000 entries; the rotated archive is named `action-log.<ISO_timestamp>.jsonl`.
- A failed log append after a successful mutation does not fail the API response; the failure is recorded via the structured logger. (v1 stand-in for the spec's sidecar + UI banner behavior — see `references/suggestions.md`.)
- The log file is append-only: past entries are never modified or removed by Maskor.
- Future undo work — when added — will only operate on entries marked `undoable: true`. (Out of scope for v1.)
