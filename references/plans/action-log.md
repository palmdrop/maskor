# Plan: Action Log v1 (observability + history page)

**Date**: 08-05-2026
**Status**: In Progress
**Specs**: `specifications/action-log.md`

---

## Goal

Every user-initiated, state-changing API operation in Maskor is funneled through a uniform command-pattern handler that performs the mutation and appends a structured log entry to a rotating, human-readable `<vault>/.maskor/action-log.jsonl`. A dedicated `/history` page reads recent entries via the API and refreshes itself by invalidating its query after each mutation. No undo/redo, no SSE wiring, no before/after payloads in v1.

---

## Design notes

### Command pattern

Every state-changing API route delegates to a `Command`. The command's execution does two things from the caller's perspective:

1. Performs the storage mutation.
2. On success, appends a log entry.

If the mutation fails: no log entry, error surfaces normally.
If the mutation succeeds but the log append fails: the failure is caught, logged via the structured logger at `error` level with the entry payload as context, and the API response succeeds anyway. This is a deliberate v1 simplification — the spec describes a sidecar file + UI banner; the plan defers that to the resilience suggestion (see `references/suggestions.md`).

### Action types — the v1 set

Naming convention is `domain:verb` (matches existing `pieces:consumed` SSE event style; matches the existing `packages/shared/src/schemas/domain/action.ts` placeholder). Strict union — not all `${domain}:${verb}` combinations are valid.

```
fragment:created
fragment:updated      (content, readyStatus, aspect weights, notes, references)
fragment:renamed      (key change)
fragment:discarded
fragment:restored

aspect:created
aspect:updated        (description, category, notes — non-key)
aspect:renamed        (key change; cascades through fragments)
aspect:deleted

note:created
note:updated          (content)
note:renamed          (key change; cascades through fragments and aspects)
note:deleted

reference:created
reference:updated     (content)
reference:renamed     (key change; cascades through fragments)
reference:deleted

sequence:fragment-placed   // defined in schema; sequencing API not implemented yet
sequence:fragment-moved    // defined in schema; sequencing API not implemented yet
```

### Cascades produce one entry, not many

Renaming a note that is referenced by 50 fragments produces a single `note:renamed` entry, not 51. This reflects user intent and keeps the log readable. The cascaded fragment rewrites are mechanical side effects and stay invisible to the action log.

### Out of scope for v1 (excluded)

- System-actor entries: piece conversion, prompt surfacing/acceptance/dismissal, project registration, fragment-opened reads
- File import (multi-fragment file split) — entry-noted in `references/TODO.md`
- Before/after payload snapshots (descriptive metadata only)
- Sidebar log panel — added to `references/suggestions.md` as a deferred feature
- DB log-table index for fast filtering — file-only in v1

### Storage shape

- Canonical store: `<vault>/.maskor/action-log.jsonl`. Append-only, one JSON object per line.
- Rotation: live file capped at `5000` entries. On overflow, rename to `action-log.<ISO_timestamp>.jsonl` and start a fresh empty file.
- Single-writer (one storage service per process). No file locking needed.

### LogEntry schema (replaces existing `Action` placeholder)

```
LogEntry {
  id: string          // uuid for the entry
  type: ActionType    // "fragment:created" | ... (strict union, see above)
  timestamp: string   // ISO 8601
  actor: "user" | "system"
  target: { type: "fragment" | "aspect" | "note" | "reference" | "sequence",
            uuid: string,
            key?: string,
            title?: string }
  payload: ActionPayload   // discriminated by action type
  undoable: boolean
}
```

The existing `packages/shared/src/schemas/domain/action.ts` defines `Action` / `ActionLog` types but is unused. v1 replaces them with this schema.

Per-action `payload` shapes (descriptive only):

- `fragment:created`: `{}`
- `fragment:updated`: `{ changedFields: Array<"content" | "readyStatus" | "aspects" | "notes" | "references"> }`
- `fragment:renamed`: `{ oldKey: string, newKey: string }`
- `fragment:discarded`: `{}`
- `fragment:restored`: `{}`
- `aspect:created`: `{}`
- `aspect:updated`: `{ changedFields: Array<"description" | "category" | "notes"> }`
- `aspect:renamed`: `{ oldKey: string, newKey: string }`
- `aspect:deleted`: `{}`
- `note:created`, `note:updated`, `note:renamed`, `note:deleted`: same pattern as aspect
- `reference:*`: same pattern as note
- `sequence:fragment-placed`, `sequence:fragment-moved`: stub schemas (defined, not emitted)

### Frontend delivery — no SSE for action log

Every action log entry originates from a Maskor mutation. The mutation response handler in the frontend invalidates the action log query and re-fetches. No new SSE channel.

This also means the watcher's existing SSE stream stays scoped to its current job (vault sync events). External vault changes do not produce log entries, so they do not need to push action log updates.

(A separate question — whether the watcher's SSE should narrow to external-only events — is a broader concern. Noted, not part of this plan.)

---

## Tasks

### 1. Foundation: spec sync + docs

- [x] Update `specifications/action-log.md` (already done as part of plan revision): expanded action type table, rotation, fail-loud, no-SSE notes _(2026-05-08)_
- [x] Add a "Command pattern" section to `packages/api/README.md`. Rule: every state-changing API route delegates to a command; commands live in `packages/api/src/commands/`; each command performs mutation + log append. _(2026-05-08)_
- [x] Add a one-line note in `packages/api/CLAUDE.md`: every state-changing API operation must go through `packages/api/src/commands/`. Direct storage calls in route handlers are not allowed for mutations. _(2026-05-08)_
- [x] Add a suggestion entry in `references/suggestions.md` for the deferred sidebar log panel _(2026-05-08)_
- [x] Add file-import (multi-fragment split) entry in `references/TODO.md` _(2026-05-08)_

### 2. Shared schemas — replace existing action.ts

- [x] Rewrite `packages/shared/src/schemas/domain/action.ts` _(2026-05-08)_
- [x] Add `LogEntryListSchema = z.array(LogEntrySchema)` for the read endpoint _(2026-05-08)_
- [x] Confirm `packages/shared/src/schemas/domain/index.ts` re-export still works _(2026-05-08)_

### 3. Storage: action log module

- [x] New module `packages/storage/src/action-log/` with `types.ts`, `writer.ts`, `reader.ts`, `index.ts` _(2026-05-08)_
- [x] Constants: `ACTION_LOG_DIRNAME`, `ACTION_LOG_FILENAME`, `DEFAULT_ROTATION_THRESHOLD` _(2026-05-08)_
- [x] Audit watcher's ignore list — `.maskor/` already excluded via dotfile pattern _(2026-05-08)_

### 4. Storage service: expose action log namespace

- [x] Modify `packages/storage/src/service/storage-service.ts` with writer cache, `getActionLogWriter`, and `actionLog` namespace _(2026-05-08)_

### 5. API: command-handler infrastructure

- [x] New module `packages/api/src/commands/` with `types.ts`, all fragment/aspect/note/reference commands, `split-update.ts`, `index.ts` _(2026-05-08)_
- [x] Each command sets `undoable` correctly per the spec table _(2026-05-08)_

#### Rename vs update split

For aspects / notes / references / fragments, the existing PATCH endpoints accept a partial that may include both key and non-key fields. The route handler:

1. Inspects the patch.
2. If `key` differs from the existing entity's key AND no other fields changed → `*:renamed` command.
3. If `key` differs AND other fields changed → emit `*:renamed` and `*:updated` (two log entries — they are conceptually distinct user intents). Acceptable given a single API call.
4. If only non-key fields changed → `*:updated`.
5. If nothing changed → no log entry (also no mutation).

This rule lives in a shared helper `splitUpdateIntoCommands()` to keep the four route handlers symmetric.

### 6. API: refactor existing routes to commands

- [x] Refactored `fragments.ts`, `aspects.ts`, `notes.ts`, `references.ts` to use `executeCommand` _(2026-05-08)_

### 7. API: read endpoint for the log

- [x] New route file `packages/api/src/routes/action-log.ts` with `GET /` endpoint _(2026-05-08)_
- [x] Mounted in `packages/api/src/app.ts` under `projectScopedApp` _(2026-05-08)_
- [x] Updated `packages/api/README.md` route list _(2026-05-08)_

### 8. Frontend: API hook + types

- [x] Hand-written custom hook `packages/frontend/src/api/action-log.ts` — `useActionLog`, `useInvalidateActionLog` (orval can't be regenerated without a running server) _(2026-05-08)_
- [x] Query invalidation wired in `fragment-editor.tsx`, `AspectEditor.tsx`, `NoteEditor.tsx`, `ReferenceEditor.tsx` _(2026-05-08)_

### 9. Frontend: history page

- [x] New `packages/frontend/src/pages/ProjectHistoryPage/` with `index.tsx`, `ActionLogList.tsx`, `renderers/` _(2026-05-08)_
- [x] Added `historyRoute` to `packages/frontend/src/router.ts` _(2026-05-08)_
- [x] Added nav link to `ProjectShellLayout` _(2026-05-08)_

### 10. Tests

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- [x] `packages/storage/src/__tests__/action-log/writer.test.ts` _(2026-05-08)_
- [x] `packages/storage/src/__tests__/action-log/reader.test.ts` _(2026-05-08)_
- [x] `packages/api/src/__tests__/commands/execute-command.test.ts` _(2026-05-08)_
- [x] `packages/api/src/__tests__/commands/split-update.test.ts` — classifyUpdate + diff helpers _(2026-05-09)_
- [x] `packages/api/src/__tests__/routes/action-log.test.ts` _(2026-05-08)_
- [x] PATCH split behavior covered by `packages/api/src/__tests__/routes/fragment-update-changedfields.test.ts` (rename + content, no-op, content-only with full metadata patch) _(2026-05-09)_
- [ ] Integration tests for aspect / note / reference PATCH split behavior (parity with fragment coverage)
- [ ] Frontend: `ProjectHistoryPage` render test; mutation invalidation refreshes list

---

## What is NOT in scope

- DB log-table index (deferred until filtering / search is needed)
- Sidebar panel UI (deferred)
- Reading from rotated archive files in the UI
- Undo / redo
- Logging system actions (`piece-converted`, `prompt:*`, `fragment:opened`, `project:registered`)
- Before / after state snapshots in payloads
- Sequence action emission (defined in schema; sequencing API not implemented yet)
- File-import action (deferred — see `references/TODO.md`)
- Filtering / search UI on the history page
- SSE channel for action log entries (frontend invalidates after mutation instead)

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented.

---

## Post-review fixes (2026-05-09)

Review: `references/reviews/action-log-2026-05-08.md`. Addressed:

- **`*:updated` payload now reports only fields whose values actually differ from `existing`**, not "fields present in patch". `classifyFragmentUpdate` / `classifyKeyedEntityUpdate` were replaced by `classifyUpdate(keyChanged, nonKeyChanged)` plus deep-equality helpers (`stringArraysEqual`, `aspectWeightsEqual`); each `update*Command` does its own field-by-field diff against the freshly-read existing entity.
- **No-op PATCH short-circuits**: when neither key nor any non-key field actually changed, the command returns the existing entity unchanged, performs no storage write, and emits no log entry. Matches the plan's rule #5.
- **`recordEditSaved` moved into `updateFragmentCommand`** and gated on real changes, so opening a fragment and saving without edits no longer increments edit stats.
- **History page renderers**: per-domain text builders (`renderers/{fragment,aspect,note,reference,sequence}.tsx`) now return strings; `ActionLogList` adds a `[FRAGMENTS]` style chip derived from `target.type` and wraps the text in a `<Link>` to the entity editor when the entity still exists. `ProjectHistoryPage` queries the four indexed lists and passes per-domain existence sets down. `*:deleted` entries and entries whose target uuid is no longer in the live index render plain text.
- **History page subtitle**: clarifies the page covers Maskor-API actions only (external vault edits are not tracked).
- **`writer.test.ts` race fixed**: missing `await` on `chmod` was making the read-only-path test pass in isolation but fail under load.
