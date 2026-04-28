# Spec: Action Log

**Status**: Stable
**Last updated**: 2026-04-27

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

- **Action type** — what kind of operation was performed (e.g. `FRAGMENT_CREATE`, `FRAGMENT_UPDATE`, `ASPECT_DELETE`).
- **Timestamp** — when the action occurred.
- **Actor** — the source of the action: `user` (UI-triggered) or `system` (watcher-triggered, e.g. piece auto-conversion).
- **Target** — the entity affected: type + UUID (e.g. `fragment:<uuid>`).
- **Payload** — a snapshot of the relevant before/after state needed to reverse or describe the action. Exact shape is action-type-specific.
- **Undoable** — boolean flag indicating whether this entry can be reversed by Maskor.

### Action types

At minimum, the following action types must be recorded:

| Type                      | Undoable | Notes                                                                                                                                |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `FRAGMENT_CREATE`         | No       | Creation undo is not supported — undoing a create by moving the fragment to discarded is surprising and easy to trigger accidentally |
| `FRAGMENT_UPDATE`         | Yes      | Undo restores previous title, readyStatus, aspect weights, notes, references                                                         |
| `FRAGMENT_DISCARD`        | Yes      | Undo restores the fragment to active                                                                                                 |
| `FRAGMENT_RESTORE`        | Yes      | Undo discards the fragment again                                                                                                     |
| `ASPECT_CREATE`           | Yes      | Undo removes the aspect                                                                                                              |
| `ASPECT_RENAME`           | Yes      | Undo restores previous key/name                                                                                                      |
| `ASPECT_DELETE`           | Yes      | Undo restores the aspect; orphaned fragment weights remain warnings                                                                  |
| `SEQUENCE_FRAGMENT_PLACE` | Yes      | Undo removes the fragment from its placed position                                                                                   |
| `SEQUENCE_FRAGMENT_MOVE`  | Yes      | Undo returns the fragment to its previous position                                                                                   |
| `PIECE_CONVERTED`         | No       | System action; source file is gone, reversal not possible                                                                            |
| `PROJECT_REGISTER`        | No       | Registration is not reversible via undo                                                                                              |
| `FRAGMENT_OPENED`         | No       | User navigated to a fragment in the editor; read event, not a mutation                                                               |
| `PROMPT_SURFACED`         | No       | A fragment was suggested by the prompting engine                                                                                     |
| `PROMPT_ACCEPTED`         | No       | User accepted a prompt and opened the suggested fragment                                                                             |
| `PROMPT_SKIPPED`          | No       | User clicked "next" — saw the suggestion but asked for a different one                                                               |
| `PROMPT_DISMISSED`        | No       | User dismissed the prompt without accepting any suggestion                                                                           |

Additional action types are added as features are built. The list above is not exhaustive.

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
- The log is append-only. Maskor never deletes or modifies past entries.
- The log is owned by Maskor. Users should not edit it directly, but they can read it.
- On rebuild or DB wipe, the log file is preserved — it is not re-derivable from vault files.

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
- The action log must not grow unboundedly in production. A rotation or truncation strategy is needed — this is an open question.

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
- [ ] 2026-04-27 — Log rotation: should old entries be trimmed after N lines, after a time window, or never (rely on the user to manage vault size)?
- [ ] 2026-04-27 — Should the UI action panel show log-only entries (e.g. piece conversions) alongside undoable ones, or filter them out by default?

---

## Acceptance criteria

- Every user-initiated fragment create, update, discard, and restore action produces a log entry in `<vault>/.maskor/action-log.jsonl`.
- Undoing a `FRAGMENT_UPDATE` restores the fragment's previous title, readyStatus, aspect weights, notes, and references.
- Undoing a `FRAGMENT_DISCARD` moves the fragment back to the active set.
- Redo re-applies the most recently undone action. A new user action after an undo clears the redo stack.
- The log file is append-only: past entries are never deleted or modified by Maskor.
- A server restart clears the in-memory undo/redo stack. The log file is preserved.
- Watcher-triggered actions (e.g. piece conversion) are logged with `actor: "system"` and `undoable: false`.
- Attempting to undo an action whose target was subsequently modified externally does not silently overwrite the external edit.
