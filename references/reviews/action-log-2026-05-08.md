# Review: Action Log v1

**Date**: 2026-05-08
**Scope**: `packages/api/src/commands/`, `packages/api/src/routes/action-log.ts`, `packages/storage/src/action-log/`, `packages/frontend/src/pages/ProjectHistoryPage/`, `packages/frontend/src/api/action-log.ts`, `packages/shared/src/schemas/domain/action.ts`
**Plan**: `references/plans/action-log.md`
**Spec**: `specifications/action-log.md`

---

## Overall

The implementation matches the spec's structural goals — command pattern, single rotated `.jsonl` log, `domain:verb` action types, fail-loud-on-mutation / log-best-effort, history page that invalidates after mutation. The core defect is in change classification: `*:updated` log entries claim every metadata field changed on every save, because the classifier looks at "field present in patch", not "field value differs from existing". The plan's stated rule that a no-op patch produces no log entry and no mutation is also unimplemented. Two pieces of UX feedback (domain prefix, entity links) are renderer-only changes. Plan status is marked `Done` while several listed test items remain unchecked.

---

## Bugs

### 1. `*:updated` payload always reports every present field, not actually-changed ones

`packages/api/src/commands/split-update.ts:9` and `:29` — `classifyFragmentUpdate` / `classifyKeyedEntityUpdate` build `changedFields` by filtering for `patch[field] !== undefined`. The frontend always sends every metadata field (`packages/frontend/src/components/fragments/fragment-metadata-form.tsx:60` returns `readyStatus`, `notes`, `references`, `aspects` unconditionally) and `onContentSave` (`packages/frontend/src/components/fragments/fragment-editor.tsx:109`) merges in `content`. Result: a content-only edit logs `changedFields: ["content", "readyStatus", "aspects", "notes", "references"]`.

```
user edits prose → frontend sends full patch → classifier counts every present field → log entry lists all 5
```

Fix: in `classify*Update`, compare each present field against `existing` and only include genuinely different values. Needs deep-equality for `notes` / `references` arrays and the `aspects` map (string keys → `{ weight }`). Same shape needed for aspect / note / reference updates.

### 2. No-op updates still mutate and (sometimes) log

`packages/api/src/routes/fragments.ts:310`, `packages/api/src/commands/aspects/update-aspect.ts:16`, and the equivalent note/reference command files — the route always calls `executeCommand`, the command always calls `storageService.*.write/update`, and only then does classification run. The plan's rule #5 ("If nothing changed → no log entry, also no mutation") is not honored; the file is rewritten and the index touched even when the patch is fully equal to existing. Today this is masked because Bug #1 makes `changedFields` non-empty for almost every patch.

Fix: after fixing #1, short-circuit when classification yields `keyChanged === false` and `changedFields.length === 0` — return early before touching storage. Either at the route or inside the command.

---

## Design

### 3. Renderer text lacks domain prefix and links to the underlying entity

`packages/frontend/src/pages/ProjectHistoryPage/renderers/{fragment,aspect,note,reference}.tsx` emit plain strings like `Edited fragment "key" — content,...`. Two requested changes:

- **Domain prefix.** Spec uses `domain:verb` ids; the UI should make domain visually obvious. Cleanest is a small `[FRAGMENTS]` chip rendered in `ActionLogList.tsx` next to the entry text, derived from `target.type` — keeps domain off the hands of every per-action renderer.
- **Entity links.** `target.uuid` already identifies the entity; routes already exist for fragment / aspect / note / reference editors. The history page can read the existing `useList*` query caches to build a `Set<uuid>` per domain and pass it into the renderers. Render as a link when present, plain text when not. Discarded fragments still exist (the editor handles the banner) — they should link. `*:deleted` entries and any entry whose target uuid is missing from the live list should remain plain text. Show the snapshot key (`target.key`), not a re-resolved current key — spec calls this "acceptable for an observability log" (`specifications/action-log.md:47`).

Restorability from this view is correctly deferred.

### 4. `executeCommand` casts to `LogEntry` after spread, bypassing the discriminated union

`packages/api/src/commands/types.ts:35` — `as LogEntry` after `{ ...entry, id, timestamp }` means a command that builds a malformed `(type, payload)` pair won't be caught at the type level. The current commands are correct, but the surface area only grows from here. Worth tightening: have `Command<TInput, TOutput>` constrain `logEntries` to `LogEntry["type"]`-aware variants, or introduce a `buildLogEntry(type, payload, ...)` helper that proves the discriminator pairing.

---

## Minor

### 5. Plan status says `Done` while task #10 is partially unchecked

`references/plans/action-log.md:185-193` lists three test items still unchecked: integration tests per route family, PATCH split behavior (rename-only / update-only / both / no-op), frontend `ProjectHistoryPage` render + invalidation. Either land them or set status to `In Progress`. The PATCH-split tests are particularly relevant given Bugs #1 and #2.

### 6. `target.title` is in the schema but never set

`packages/shared/src/schemas/domain/action.ts:31` defines `title?` on the target. No command sets it. Fine for v1 since `key` is the human identifier for every entity, but worth either dropping the field or filing a use case (e.g. fragments that grow a separate title) to justify keeping it.

### 7. History page name vs. coverage

The page is labelled "history" / "Recent Actions" but only covers Maskor-API mutations — external Obsidian edits never appear. Matches the spec, but a user reading "history" may reasonably expect everything. Consider a one-line subtitle on the page clarifying scope ("Actions taken through Maskor — external vault edits are not tracked").

---

## Non-issues

- **Log append failure swallowed in `executeCommand`** — `packages/api/src/commands/types.ts:37` catches and logs only. Matches the plan's documented v1 stand-in for the spec's sidecar + UI banner approach.
- **No SSE channel for action log entries** — invalidation after mutation is the design; spec line 126 spells this out.
- **One log entry per cascade rename** — confirmed in `update-aspect.ts` etc.; the cascaded fragment writes are mechanical and correctly stay invisible.
- **Snapshot `target.key` going stale after later renames** — explicitly accepted by the spec for an observability log.
- **`fragment:created` not undoable** — matches the spec's table and the prior decision in spec lines 167.
- **Unconditional `actionLog.append` in `executeCommand` even for non-undoable entries** — by design; the `undoable` flag marks reversibility, not whether to record.
