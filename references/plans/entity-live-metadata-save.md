# Plan: Split content vs metadata — single-intent action types + live metadata save

**Date**: 09-05-2026
**Status**: Todo
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

- [ ] **Spec update** — `specifications/action-log.md`: action type table, `*:updated` vs `*:edited`, scalar deltas allowance, cascade restatement.
- [ ] **Schema** — `packages/shared/src/schemas/domain/action.ts`: extend `ActionTypeSchema` with the new types; add discriminated payload variants for each. Keep existing `*:updated` variants unchanged.
- [ ] **Schema fix (bonus)** — re-parameterize the `entry()` helper so payload type narrows on the discriminator (currently `payload: z.ZodTypeAny` erases payload typing). Tests should not need `as { changedFields: string[] }` casts after this. (Cross-ref Design item 4 in the action-log review.)
- [ ] **Command input** — extend `UpdateFragmentInput` / `UpdateAspectInput` / `UpdateNoteInput` / `UpdateReferenceInput` with `source: "user-content-save" | "user-metadata" | "programmatic"`. Routes that exist today pass `"user-metadata"` for PATCHes that contain only metadata fields, `"user-content-save"` for PATCHes whose only non-key change is the content field, and the catch-all path falls through to `programmatic` if neither applies.
- [ ] **Diff helpers** — add to `packages/api/src/commands/split-update.ts`:
  - `diffStringSet(before: string[], after: string[]): { added: string[]; removed: string[] }` for notes/references.
  - `diffAspectWeights(before, after): { added: { key, weight }[]; removed: string[]; weightChanged: { key, from, to }[] }`.
- [ ] **`updateFragmentCommand`** — replace the current `changedFields[]` log emission with single-intent emission per the rules above. Preserve existing `fragment:renamed` behavior. Multi-element relational changes produce multiple entries from one command.
- [ ] **`updateAspectCommand`** — same pattern; emit `aspect:category-changed`, `aspect:note-{attached,detached}`, `aspect:description-edited` (when source is `user-content-save`), or `aspect:updated` for catch-all.
- [ ] **`updateNoteCommand`** / **`updateReferenceCommand`** — when source is `user-content-save` and only content changed, emit `note:edited` / `reference:edited` instead of `note:updated` / `reference:updated`.
- [ ] **Routes** — `fragments.ts` / `aspects.ts` / `notes.ts` / `references.ts`: classify the incoming PATCH and pass the appropriate `source` to the command. Single-field metadata PATCHes from Stage 2 will arrive as `user-metadata`.
- [ ] **Greenfield reset** — delete any existing `<vault>/.maskor/action-log.jsonl` files in dev vaults; no migration code. Document the one-time reset in the spec amendment.
- [ ] **Renderers** — `packages/frontend/src/pages/ProjectHistoryPage/renderers/`: per-domain text builders gain cases for the new action types. Wording target: "Note 'bridge-obs' attached to fragment 'late-winter'", "Tone weight on fragment 'late-winter': 50% → 70%", "Ready status on fragment 'late-winter': 20% → 50%".
- [ ] **Tests**:
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
1. `onMutate` — snapshot prior cache; write optimistic value.
2. PATCH fires. `onError` — restore snapshot; surface a toast.
3. `onSettled` — invalidate the entity's query (refetch authoritative value) and the action-log query (so the new entry shows up on the history page).

Reuse `useInvalidateActionLog` from `packages/frontend/src/api/action-log.ts`. The invalidation should already be happening for content saves — verify it now also fires for metadata mutations.

### Stage 2 tasks

- [ ] **Hook** — implement `useLiveFieldSave` with the responsibilities above; unit-test debounce, skip-on-equal, optimistic snapshot/rollback.
- [ ] **FragmentMetadataForm** — rewrite as live form. Each field calls `useLiveFieldSave` with a single-field PATCH. Drop `isMetadataDirty`. Remove the `getValidatedValues` imperative API.
- [ ] **fragment-editor.tsx** — `isDirty` derived from content prose only. `onContentSave` no longer merges metadata. Confirm Save button + Cmd+S behavior is unchanged from the user's perspective.
- [ ] **AspectEditor** — add category + notes sidebar via `EntityEditorShell.sidebar`; wire each through `useLiveFieldSave`.
- [ ] **NoteEditor / ReferenceEditor** — verify content-save path emits `*:edited` (depends on Stage 1 route changes). No other change.
- [ ] **Failure UX** — pick the toast/banner pattern (existing project precedent if any; otherwise add a minimal banner near the field). Wire rollback.
- [ ] **Tests**:
  - Unit: `useLiveFieldSave` — debounces, skips equal-flush, optimistic-then-rollback.
  - Integration: `FragmentMetadataForm` — toggle a note → cache updates immediately, PATCH fires after 400ms, toggling back within the window cancels the PATCH.
  - Integration: `AspectEditor` — category live-save, note attach/detach live-save.
  - Frontend `ProjectHistoryPage` render test (rolled forward from the action-log Stage 1 plan).

---

## Cross-stage notes

- **Stage 1 ships independently** of Stage 2. Once Stage 1 lands, the existing frontend will produce single-intent log entries per save (one PATCH → multiple entries because the patch carries multiple fields). That is the intended improvement; Stage 2 then makes those entries arrive in real time and reflect single user gestures.
- **Cascades unchanged** — renaming an aspect that is attached to N fragments still produces one `aspect:renamed` entry, not N. The relational entries are emitted only when a user (or programmatic actor) changes the relationship itself.
- **Sequence types** stay stubbed; nothing in this plan touches them.
- **Out of scope**: undo/redo (still deferred per the action-log spec); persisting the action log across vault wipes; surfacing failed metadata PATCHes in the history page; system-actor entries.

---

## Tasks — combined index

Ordering reflects priority within each stage. The two stages can be implemented together or one at a time; the combined view is for picking and packaging.

### Stage 1 (backend)

- [ ] Spec update — action type table + `*:updated` vs `*:edited` + scalar deltas + cascade restatement
- [ ] Extend `ActionTypeSchema` and discriminated `LogEntrySchema` with new types
- [ ] Re-parameterize `entry()` helper for payload type narrowing
- [ ] Add `source` to command inputs; routes classify and pass it
- [ ] Add `diffStringSet` and `diffAspectWeights` to `split-update.ts`
- [ ] Rewrite `updateFragmentCommand` to emit single-intent entries
- [ ] Rewrite `updateAspectCommand` to emit single-intent entries (description-edited / category-changed / note-attached / note-detached)
- [ ] `updateNoteCommand` / `updateReferenceCommand` emit `*:edited` for `user-content-save`
- [ ] Delete any existing dev-vault `action-log.jsonl` files; document one-time reset
- [ ] Renderers — text builders for all new action types
- [ ] Tests — diff helpers, per-route split behavior, parity across fragment/aspect/note/reference

### Stage 2 (frontend)

- [ ] Implement `useLiveFieldSave` hook + unit tests
- [ ] Rewrite `FragmentMetadataForm` as live form
- [ ] Update `fragment-editor.tsx` so `isDirty` is content-only
- [ ] Add live category + notes sidebar to `AspectEditor`
- [ ] Verify `NoteEditor` / `ReferenceEditor` content save emits `*:edited`
- [ ] Failure UX — rollback + toast/banner
- [ ] Integration tests — fragment metadata live-save, aspect metadata live-save
- [ ] `ProjectHistoryPage` render test (rolled forward from prior plan)

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented.
