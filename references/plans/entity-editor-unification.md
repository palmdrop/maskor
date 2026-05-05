# Entity Editor Unification

**Date**: 04-05-2026
**Status**: Phases 1–5 complete; Phase 6 (tests, codegen) remaining

---

## Goal

> Unify all entity editors (Fragment, Note, Reference, Aspect) under an evolved `EntityEditorShell` with a shared key-editing pattern, optional metadata sidebar slot, and reusable dirty-state tracking — eliminating bespoke layouts and ensuring any new feature lands everywhere at once.

---

## Context

`EntityEditorShell` already handles Note and Reference. `AspectEditor` and `FragmentEditor` are bespoke and will diverge further as metadata and dirty tracking spread to all entity types. The unification relies on two prerequisites:

- **Fragment `key`**: Fragments currently use only `title`. Like other domain concepts, they need a `key` (filename stem) as the rename handle, with `title` demoted to a metadata field.
- **Aspect cascade warnings**: The backend already returns `{ aspect, warnings }` on aspect rename; the frontend `AspectEditor` ignores it. Wiring this up is part of phase 3.

---

## Phase 1 — Extract `useDirtyState` hook ✅

**Goal**: Replace the ad-hoc multi-source dirty tracking in `FragmentEditor` with a reusable hook. No visible behavior change.

- [x] Create `packages/frontend/src/hooks/useDirtyState.ts`
- [x] Hook accepts an array of source names and returns:
  - [x] `isDirty: boolean` — true if any source is dirty
  - [x] `setSourceDirty(source: string, dirty: boolean): void`
  - [x] `clearAllDirty(): void`
  - [x] `notifyChange(next: boolean): void` — optional external callback integration
- [x] Replace the `isProseEditedRef` / `isMetadataDirtyRef` / `isDirtyRef` pattern in `FragmentEditor` with this hook
- [x] Replace the single `isDirty` boolean in `EntityEditorShell` with the same hook (single `"prose"` source for now)

---

## Phase 2 — Add `key` to Fragment (backend + API)

**Goal**: Give fragments the same rename-by-key pattern used by notes, references, and aspects.

### 2a — Domain schema (`packages/shared`) ✅

- [x] Add `key: z.string()` to `FragmentSchema`
- [x] Add `key: z.string().min(1).optional()` to `FragmentUpdateSchema`
- [x] Add `FragmentUpdateResponseSchema` and `FragmentUpdateResponse` type

### 2b — API schemas (`packages/api/src/schemas/fragment.ts`) ✅

- [x] Expose `key` on `FragmentSchema` and `IndexedFragmentSchema`
- [x] Add `FragmentUpdateResponseSchema`: `{ fragment: FragmentSchema, warnings: z.array(z.string()) }` — mirrors the shape used by notes/references
- [x] Switch PATCH endpoint response from returning the fragment directly to returning this envelope

### 2c — Route handler (`packages/api/src/routes/fragments.ts`) ✅

- [x] Validate `key` via `validateEntityKey` when present (same guard used for notes/references/aspects)
- [x] On key change: rename the underlying vault file (handled by `storageService.fragments.write()` detecting key change vs old filePath)
- [x] Return `{ fragment, warnings: [] }` on success (no cascade — nothing references fragments by name)
- [x] `createFragment`: derive `key = slugify(title)` on creation

### Storage layer changes (prerequisite for 2c) ✅

- [x] `packages/storage/src/vault/markdown/mappers/fragment.ts`: derive `key` from filename stem in `fromFile`
- [x] `packages/storage/src/vault/markdown/vault.ts`: use `fragment.key` instead of `slugify(fragment.title)` for filenames in `write()`, `discard()`, `restore()`
- [x] `packages/storage/src/vault/markdown/init.ts`: set `key = slug` when creating fragment from piece
- [x] `packages/storage/src/db/vault/schema.ts`: add `key TEXT NOT NULL` column to `fragmentsTable`
- [x] `packages/storage/src/db/vault/migrations/20260504_add_fragment_key.sql`: migration to add and populate key column
- [x] `packages/storage/src/db/vault/migrations/meta/_journal.json`: register new migration
- [x] `packages/storage/src/indexer/types.ts`: add `key: string` to `IndexedFragment`
- [x] `packages/storage/src/indexer/assemblers.ts`: populate `key` from `row.key`
- [x] `packages/storage/src/indexer/upserts.ts`: store `key` in `upsertFragment`
- [x] `packages/storage/src/service/storage-service.ts`: use `fragment.key` for path computation in `write()`, `discard()`, `restore()`

### 2d — Regenerate orval client

- [x] Manually patched generated types (codegen requires running server): added `key` to `Fragment`/`IndexedFragment`, added `key?` to `FragmentUpdate`, added `FragmentUpdateResponse` interface, updated `UpdateFragmentResponse200.data` to `FragmentUpdateResponse`
- [x] `FragmentEditor` reads `result.data.warnings` from the new envelope shape

---

### ✅ Blocking issue resolved

Deleted `packages/test-fixtures/basic-vault/.maskor/vault.db` and `packages/test-fixtures/user-vault/.maskor/vault.db`. The migration system recreates them fresh on first use, applying all migrations including `20260504_add_fragment_key`.

---

## Phase 3 — Evolve `EntityEditorShell` ✅

**Goal**: Add extension points for the sidebar and extra actions; make back-navigation optional.

Changes to `packages/frontend/src/components/entity-editor-shell.tsx`:

- [x] Add `sidebar?: ReactNode` prop — rendered as an `<aside>` in a horizontal split layout; when absent, the prose editor fills full width
- [x] Add `extraActions?: ReactNode` prop — rendered left of the Save button in the header action area
- [x] Add `banner?: ReactNode` prop — rendered above the header; used for discarded-fragment notices
- [x] Replace `configTab`/`fragmentId` with `backNode?: ReactNode` — callers construct the full `<Link>` element; omit to suppress the back arrow (diverged from plan: used `ReactNode` instead of structured `{to, params, search}` to preserve TanStack Router type safety)
- [x] Add `additionalDirty?: boolean` — ORed with prose dirty for Save button enable state; used by FragmentEditor for metadata dirty
- [x] Add `onDirtyChange?: (isDirty: boolean) => void` — notifies caller when prose dirty changes
- [x] Use `useDirtyState` internally (from Phase 1)
- [x] Update `NoteEditor` and `ReferenceEditor` call sites to the new `backNode` prop shape

---

## Phase 4 — Bring `AspectEditor` under `EntityEditorShell` ✅

**Goal**: Delete `AspectEditor`'s bespoke layout and gain inline key editing + cascade warnings for free.

Changes to `packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.tsx`:

- [x] Add `onKeySave` callback: calls `updateAspect({ key })`, reads `result.data.warnings`, sets `cascadeWarnings` state
- [x] Add `onContentSave` callback: calls `updateAspect({ description: content })`
- [x] Render `<EntityEditorShell>` with `backNode`, `entityKey`, `content`, `cascadeWarnings`, `onDismissWarnings`
- [x] Delete the bespoke header, Heading, Separator, ProseEditor, and save button from `AspectEditor`

---

## Phase 5 — Bring `FragmentEditor` under `EntityEditorShell` ✅

**Goal**: Replace `FragmentEditor`'s bespoke layout with the shell, wiring metadata sidebar and discard/restore as slots.

**Decision (5b)**: Unified save — the shell's `onContentSave` collects metadata from the form ref and saves both prose + metadata atomically. Matches spec requirement for a single Save button.

### 5a — Key editing ✅

- [x] `onKeySave`: calls `updateFragment({ key })`, reads `result.data.warnings`, sets `cascadeWarnings`

### 5b — Content save ✅

- [x] `onContentSave`: collects metadata via `metadataFormRef.current?.getValidatedValues()` then saves `{ ...metadataUpdate, content }` atomically

### 5c — Shell wiring ✅

- [x] `<FragmentMetadataForm>` as `sidebar` prop
- [x] Discard/Restore `<Button>` as `extraActions`
- [x] No `backNode` (fragments have no parent config page)
- [x] `useDirtyState(["prose", "metadata"])` in `FragmentEditor`; metadata dirty tracked separately with `useState` and passed as `additionalDirty`; prose dirty relayed via shell's `onDirtyChange` callback
- [x] Discarded banner passed as `banner` prop

### 5d — Cleanup ✅

- [x] Removed bespoke two-panel flex layout, aside, header, and manual refs from `FragmentEditor`

---

## Phase 6 — Tests and cleanup

- [ ] Add/update tests for `useDirtyState` (unit)
- [ ] Add/update integration tests for fragment rename: rename → reload → assert key updated, warnings returned where applicable
- [x] `bun run verify` passes (type-check + test suite) — 202 backend + 2 frontend tests pass
- [x] Updated `storage-service.test.ts` rename test to use `key` instead of `title`
- [x] Updated `fragment.test.ts` fixture to include `key` field
- [ ] Check `SUGGESTIONS.md` for any entries made obsolete by this work and remove them
- [ ] Run `bun run codegen` once API server is available to regenerate orval client (currently manually patched)
