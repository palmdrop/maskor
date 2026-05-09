# Plan: Split content vs metadata — single-intent action types + live metadata save

**Date**: 09-05-2026
**Status**: Done
**Specs**: `specifications/action-log.md`

---

## Goal

Editing an entity's metadata (notes, references, aspect attachments + weights, ready status, aspect category + notes) is committed to the server immediately on change — debounced 400ms per field, optimistic in the UI — and recorded in the action log as a single-intent event (e.g. `fragment:note-attached`, `fragment:aspect-weight-changed`). Editing the body content remains an explicit Save and is recorded as `*:edited`. The action log reads like sentences ("Note 'bridge-obs' attached to fragment 'late-winter'") instead of generic "fragment updated — notes" lines. The existing `fragment:updated` / `aspect:updated` types stay as a catch-all for multi-field/programmatic updates.

---

## Background

Stems from `references/reviews/action-log-2026-05-08.md` Design 3. The current `fragment:updated` payload reports "fields present in patch", which after the post-review fix reports actually-changed fields — but still as a flat list (`changedFields: ["notes"]`). That reads as "Fragment X edited — notes", which hides the intent. The user's mental model is structural-change-per-action; the plan aligns the action log and the editor UX to that model.

Decisions baked in (settled with the user before planning):

- 400ms debounce, **per field**. If duplication grows, extract a reusable hook.
- Optimistic UI for metadata changes (React Query `onMutate` + rollback on error).
- Apply to all entity editors (fragments, aspects, notes, references) via the shared `EntityEditorShell`. Notes/references have no metadata sidebar today — for them the change is only the new `*:edited` action type for content saves.
- Keep `fragment:updated` and `aspect:updated` as catch-all for multi-field/programmatic updates. Add `fragment:edited` and `aspect:description-edited` for explicit user content saves.
- Both stages live in this single plan; the user chooses to implement together or in sequence at execution time.

---

## Stage 1 — Backend: single-intent action types from PATCH diff

The backend learns to emit specific action types based on the diff between `existing` and the patched state. The current frontend (which still bundles metadata into the content PATCH) immediately benefits — multi-field saves produce one log entry per real change.

### New action types

**Fragment** (additions):

- `fragment:edited` — content-only user save. Payload: `{}`.
- `fragment:ready-status-changed` — payload: `{ from: number, to: number }`.
- `fragment:note-attached` — payload: `{ noteKey: string }`.
- `fragment:note-detached` — payload: `{ noteKey: string }`.
- `fragment:reference-attached` — payload: `{ referenceKey: string }`.
- `fragment:reference-detached` — payload: `{ referenceKey: string }`.
- `fragment:aspect-attached` — payload: `{ aspectKey: string, weight: number }`.
- `fragment:aspect-detached` — payload: `{ aspectKey: string }`.
- `fragment:aspect-weight-changed` — payload: `{ aspectKey: string, from: number, to: number }`.

**Fragment** (kept):

- `fragment:updated` — catch-all. Used when the diff produces multiple non-relational changes in one PATCH that don't fit the single-intent set, or for programmatic/batch updates. Payload: `{ changedFields: ... }` (existing shape).

**Aspect** (additions):

- `aspect:description-edited` — content-only user save. Payload: `{}`.
- `aspect:category-changed` — payload: `{ from?: string, to?: string }` (optional because category itself is optional).
- `aspect:note-attached` — payload: `{ noteKey: string }`.
- `aspect:note-detached` — payload: `{ noteKey: string }`.

**Aspect** (kept): `aspect:updated` as catch-all.

**Note** (addition):

- `note:edited` — content-only user save. Payload: `{}`.

**Note** (kept): `note:updated` as catch-all.

**Reference** (addition):

- `reference:edited` — content-only user save. Payload: `{}`.

**Reference** (kept): `reference:updated` as catch-all.

### Diff classification rule

Each `update*Command` runs the diff against `existing` and emits log entries by this priority:

1. If `key` changed → emit `*:renamed`.
2. For each non-key field that actually changed, prefer the single-intent type when one exists. For relational fields (notes/references/aspects), compute add/remove/weight-change sets and emit one entry per element changed.
3. If a non-key change doesn't map to a single-intent type (e.g. aspect description AND category in the same PATCH from a programmatic source), emit the `*:updated` catch-all carrying `changedFields`.
4. Content edits explicitly initiated by the user route emit `*:edited` instead of `*:updated`. The route signals intent via a flag on the command input (`source: "user-content-save" | "user-metadata" | "programmatic"`), since the diff alone cannot distinguish "user typed in the editor and pressed Save" from "another service patched content".

### Spec amendments

- Update `specifications/action-log.md`:
  - Expand the action-type table with the new types and their undoable flags.
  - Note that `*:updated` is now reserved for catch-all/programmatic; the user-driven content save uses `*:edited`.
  - Document the small departure from "no before/after in v1" — scalar deltas on `from/to` for ready status, aspect weight, and aspect category are permitted because they are load-bearing for human-readable rendering and not full content snapshots.
  - Restate the cascade principle: one log entry per origin still holds for renames; for metadata, one entry per actually-changed element (e.g. attaching three aspects in one PATCH = three entries).

### Stage 1 tasks

- [x] **Spec update** — `specifications/action-log.md`: action type table, `*:updated` vs `*:edited`, scalar deltas allowance, cascade restatement.
- [x] **Schema** — `packages/shared/src/schemas/domain/action.ts`: extend `ActionTypeSchema` with the new types; add discriminated payload variants for each. Keep existing `*:updated` variants unchanged.
- [x] **Schema fix (bonus)** — re-parameterize the `entry()` helper so payload type narrows on the discriminator (currently `payload: z.ZodTypeAny` erases payload typing). Tests should not need `as { changedFields: string[] }` casts after this. (Cross-ref Design item 4 in the action-log review.)
- [x] **Command input** — extend `UpdateFragmentInput` / `UpdateAspectInput` / `UpdateNoteInput` / `UpdateReferenceInput` with `source: "user-content-save" | "user-metadata" | "programmatic"`. Routes that exist today pass `"user-metadata"` for PATCHes that contain only metadata fields, `"user-content-save"` for PATCHes whose only non-key change is the content field, and the catch-all path falls through to `programmatic` if neither applies.
- [x] **Diff helpers** — add to `packages/api/src/commands/split-update.ts`:
  - `diffStringSet(before: string[], after: string[]): { added: string[]; removed: string[] }` for notes/references.
  - `diffAspectWeights(before, after): { added: { key, weight }[]; removed: string[]; weightChanged: { key, from, to }[] }`.
- [x] **`updateFragmentCommand`** — replace the current `changedFields[]` log emission with single-intent emission per the rules above. Preserve existing `fragment:renamed` behavior. Multi-element relational changes produce multiple entries from one command.
- [x] **`updateAspectCommand`** — same pattern; emit `aspect:category-changed`, `aspect:note-{attached,detached}`, `aspect:description-edited` (when source is `user-content-save`), or `aspect:updated` for catch-all.
- [x] **`updateNoteCommand`** / **`updateReferenceCommand`** — when source is `user-content-save` and only content changed, emit `note:edited` / `reference:edited` instead of `note:updated` / `reference:updated`.
- [x] **Routes** — `fragments.ts` / `aspects.ts` / `notes.ts` / `references.ts`: classify the incoming PATCH and pass the appropriate `source` to the command. Single-field metadata PATCHes from Stage 2 will arrive as `user-metadata`.
- [x] **Greenfield reset** — delete any existing `<vault>/.maskor/action-log.jsonl` files in dev vaults; no migration code. Document the one-time reset in the spec amendment.
- [x] **Renderers** — `packages/frontend/src/pages/ProjectHistoryPage/renderers/`: per-domain text builders gain cases for the new action types. Wording target: "Note 'bridge-obs' attached to fragment 'late-winter'", "Tone weight on fragment 'late-winter': 50% → 70%", "Ready status on fragment 'late-winter': 20% → 50%".
- [x] **Tests**:
  - `__tests__/commands/split-update.test.ts` — extend with `diffStringSet` and `diffAspectWeights` cases.
  - `__tests__/routes/fragment-update-changedfields.test.ts` — extend / add sibling tests for: attaching a note → one `fragment:note-attached` entry; detaching one and attaching one in the same PATCH → two entries; weight change → `fragment:aspect-weight-changed` with `from/to`; content-only save with `source: user-content-save` → `fragment:edited`; multi-field programmatic patch → `fragment:updated` catch-all.
  - Aspect / note / reference parity tests for the new types and the `*:edited` vs `*:updated` distinction.

---

## Stage 2 — Frontend: live metadata save with per-field debounce + optimistic UI

The metadata side of every entity editor is committed live. Content stays explicit-save. Independent of Stage 1: Stage 2 sends single-field PATCHes that Stage 1 can classify cleanly, but Stage 1 also works without Stage 2 (multi-field patches still produce per-element entries).

### Reusable hook

`packages/frontend/src/hooks/useLiveFieldSave.ts` — the debounced-PATCH-with-optimistic-update primitive. Sketch of responsibilities:

- Holds the "pending value" for a field; on consumer change, schedules a flush 400ms later.
- On flush, compares pending value to the last-known-server value (from React Query cache); if equal, skip the PATCH.
- On non-skip flush: optimistically writes pending value into the cache, fires the mutation, rolls back on error and surfaces a toast/banner.
- Exposes `{ value, setValue, isFlushing, error }` to the consumer.
- Generic over field type (string, number, string[], aspect map). Equality comparison passed in or defaulted to `Object.is` + the existing `stringArraysEqual` / `aspectWeightsEqual` helpers.

If a single hook can't cleanly handle every field shape, split into `useLiveScalarField`, `useLiveSetField`, `useLiveAspectWeight` — but only after the duplication appears in practice.

### Per-entity changes

**FragmentMetadataForm** (`packages/frontend/src/components/fragments/fragment-metadata-form.tsx`):

- Drop the `react-hook-form` flow and `getValidatedValues` imperative API.
- Each field (ready status, notes set, references set, per-aspect attach + weight) wires through `useLiveFieldSave`.
- Drop `isMetadataDirty` and the `onDirtyChange` callback wiring.
- Remove from the parent's `isDirty` calculation in `fragment-editor.tsx` — `isDirty` now reflects content only.

**AspectEditor** (`packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.tsx`):

- Add a sidebar to the `EntityEditorShell` exposing **category** (text input) and **notes** (string-set) — these are settable today only via the config page; surface them in the editor for parity.
- Wire both fields through `useLiveFieldSave`.
- Description (the "content") stays explicit-save and now emits `aspect:description-edited`.

**NoteEditor** / **ReferenceEditor**:

- No metadata to live-save (entities have only `key` + `content`).
- Only change: explicit content save now emits `note:edited` / `reference:edited` (Stage 1 already routes this correctly when the route passes `source: "user-content-save"`).
- Confirm no other behavioral change is needed.

**`EntityEditorShell`** (`packages/frontend/src/components/entity-editor-shell.tsx`):

- No structural change. The `isDirty` / `onSaved` / `onContentSave` props continue to govern the content side only. The shell does not need to know about metadata — that lives in the entity-specific sidebar.
- Confirm no metadata side-effects accidentally feed back through `onProseChange`.

### Optimistic + invalidation flow

For each metadata PATCH:

1. Snapshot prior cache; write optimistic value into the cache.
2. PATCH fires.
3. On success: write the response data into the entity's single-query cache (the response is the new authoritative value); invalidate the list query so collection views refresh. Do **not** invalidate the single-entity query — that would refetch and overwrite the optimistic-then-server value with a flicker.
4. On error: restore snapshot; invalidate the entity's query (so cache reflects truth); surface error inline beneath the field.
5. Always invalidate the action-log query (separate cache key).

Reuse `useInvalidateActionLog` from `packages/frontend/src/api/action-log.ts`.

### Stage 2 tasks

- [x] **Hook** — implement `useLiveFieldSave` with the responsibilities above; unit-test debounce, skip-on-equal, optimistic snapshot/rollback.
- [x] **FragmentMetadataForm** — rewrite as live form. Each field calls `useLiveFieldSave` with a single-field PATCH. Drop `isMetadataDirty`. Remove the `getValidatedValues` imperative API.
- [x] **fragment-editor.tsx** — `isDirty` derived from content prose only. `onContentSave` no longer merges metadata. Confirm Save button + Cmd+S behavior is unchanged from the user's perspective.
- [x] **AspectEditor** — add category + notes sidebar via `EntityEditorShell.sidebar`; wire each through `useLiveFieldSave`.
- [x] **NoteEditor / ReferenceEditor** — verify content-save path emits `*:edited` (depends on Stage 1 route changes). No other change.
- [x] **Failure UX** — inline error banner beneath the failing field; rollback on error in `useLiveFieldSave` save handler.
- [x] **Tests**:
  - Unit: `useLiveFieldSave` — debounces, skips equal-flush, optimistic-then-rollback, queues concurrent flushes (latest wins).
  - Integration: `FragmentMetadataForm` — detach a note → tag disappears immediately, PATCH fires after 400ms; success path writes server response into cache without invalidating the single-fragment query; error path rolls back and surfaces the error inline.
  - Integration: `AspectEditor` — category live-save; isPending stays "idle" during a metadata save (separate mutation instance from content-save).
  - Frontend `ProjectHistoryPage` render test (rolled forward from the action-log Stage 1 plan).

### Post-implementation review fixes (2026-05-09)

Tracked in `references/reviews/entity-live-metadata-save-2026-05-09.md`:

- [x] **Bug 1** — `AspectEditor` shared one `useUpdateAspect()` between content and live metadata saves; live category/notes saves disabled the content Save button and silently dropped Cmd+S. Fix: separate mutation instances.
- [x] **Bug 2** — `invalidate()` was unconditional in `finally`, refetching on success and wiping the optimistic value. Fix: on success, write server response into single-entity cache and invalidate only the list query; on error, rollback + invalidate.
- [x] **Bug 3** — `useLiveFieldSave` did not serialize concurrent flushes; rapid edits during an in-flight save could race and lose the latest value. Fix: when `isFlushingRef` is true, queue the value; the in-flight save's `finally` drains it.
- [x] **Bug 4** — Hook default debounce was 600ms vs the planned 400ms. Fix: changed default to 400ms.
- [x] **Minor 9** — Removed the `string | string[]` cast soup in `AspectEditor.makeSave` by making it generic over field type.
- [x] **Minor 11** — Reworded the misleading test description in `fragment-update-changedfields.test.ts`.
- [x] **Design 5** — Added inline comments to `update-aspect.ts` and `update-fragment.ts` explaining the catch-all rule (description/content has no programmatic single-intent type → routes to `*:updated`; other fields with single-intent types emit alongside).
- [x] **Design 8** — Added the missing integration tests (`fragment-metadata-form.test.tsx`, `AspectEditor.test.tsx`).

---

## Cross-stage notes

- **Stage 1 ships independently** of Stage 2. Once Stage 1 lands, the existing frontend will produce single-intent log entries per save (one PATCH → multiple entries because the patch carries multiple fields). That is the intended improvement; Stage 2 then makes those entries arrive in real time and reflect single user gestures.
- **Cascades unchanged** — renaming an aspect that is attached to N fragments still produces one `aspect:renamed` entry, not N. The relational entries are emitted only when a user (or programmatic actor) changes the relationship itself.
- **Sequence types** stay stubbed; nothing in this plan touches them.
- **Out of scope**: undo/redo (still deferred per the action-log spec); persisting the action log across vault wipes; surfacing failed metadata PATCHes in the history page; system-actor entries.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented.
