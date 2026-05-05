# Drop Fragment Title

**Date**: 05-05-2026
**Status**: Done

---

## Goal

> Remove the `title` field from fragments entirely, using `key` (the filename stem) as the single identity field — consistent with notes, references, and aspects.

---

## Background

Fragments currently carry both a `key` (always the filename stem) and a `title` (from frontmatter `title:`, falling back to the filename stem). The two fields are almost always identical, and the fallback logic in `deriveTitle` obscures which one is authoritative. The create flow derives a key by slugifying a user-provided title string, making `title` the input and `key` a derived artifact. After this change, `key` is both the input and the identity — the same model used by every other domain entity.

Existing vault files with `title:` in their frontmatter are not migrated; the field will simply stop being written on the next save, cleaning up gradually.

---

## Tasks

### Phase 1: Shared schemas (`packages/shared`)

- [x] `FragmentSchema`: remove `title` field.
- [x] `FragmentCreateSchema`: replace `title: z.string().min(1)` with `key: z.string().min(1)`. The caller now supplies the desired key directly; the API validates it with `validateEntityKey`.
- [x] `FragmentUpdateSchema`: remove the optional `title` field (already has optional `key`).
- [x] `Piece` type (`schemas/domain/piece.ts`): remove the optional `title` field. `Piece` is only used in the vault's "consume piece" path, which already derives the key from the filename.

### Phase 2: Storage — vault mapper (`packages/storage`)

- [x] `mappers/fragment.ts`: remove `deriveTitle` function and its call in `fromFile`.
- [x] `fromFile`: remove `title` from the returned `Fragment` object; `key` is already derived from the filename stem.
- [x] `toFile`: remove `title` from the written frontmatter. Existing files will retain a stale `title:` line until next save — acceptable, no migration needed.

### Phase 3: Storage — init (`packages/storage`)

- [x] `init.ts` (`initFragment`): receive `key` directly from `Piece` and use it as the filename stem without slugifying. Remove `deriveTitle` helper, `title` intermediate variable, and `title` from both the `Fragment` object and written frontmatter.
- [x] `vault.ts` (consume-piece call sites at lines 341–342 and 374–375): replace `{ title: basename(filePath).replace(/\.md$/, ""), content }` with `{ key: basename(filePath).replace(/\.md$/, ""), content }`.
- [x] `vault.ts`: update log fields — replace `fragmentTitle` with `fragmentKey`.

### Phase 4: Storage — DB schema + indexer (`packages/storage`)

- [x] `db/vault/schema.ts`: remove `title: text("title").notNull()` from `fragmentsTable`.
- [x] New migration: `ALTER TABLE fragments DROP COLUMN title`.
- [x] `indexer/types.ts`: remove `title` from the `IndexedFragment` type.
- [x] `indexer/assemblers.ts`: remove `title: row.title` from the assembled object.
- [x] `indexer/upserts.ts`: remove `title: fragment.title` from both upsert call sites.

### Phase 5: API (`packages/api`)

- [x] `schemas/fragment.ts`: remove `title` from all four OpenAPI schemas (indexed fragment response, fragment response, create body, update body). `IndexedFragmentSchema` inherits `title` transitively from `DomainFragmentSchema` — it drops automatically after Phase 1, but the explicit `title` override in `FragmentSchema` must be removed manually.
- [x] `routes/fragments.ts` (create route): destructure `{ key, content }` instead of `{ title, content }`, pass `key` through `validateEntityKey`, remove the slugify step, build the draft `Fragment` without `title`.

### Phase 6: Frontend (`packages/frontend`)

- [x] `fragment-metadata-form.tsx`: remove `title` from the form schema, remove the `<Label>` + `<Input>` block for Title (lines 172–173), remove `title` from `defaultValues` and `getValidatedValues`. The `fragment.key` is already editable via the rename control in `EntityEditorShell`.
- [x] Locate the fragment create flow (the UI where users name a new fragment) and update it to supply `key` directly rather than a `title` that gets slugified. The input label should reflect that users are entering a key, not a title.

### Phase 7: Tests (`packages/storage`)

- [x] `__tests__/mappers/fragment.test.ts`: remove `title: "The Bridge"` fixture field, remove assertions on `fragment.title`, remove the "derives title from filename when missing" test case, remove `expect(frontmatter.title).toBe(...)` from the `toFile` test.
- [x] `__tests__/storage-service.test.ts`: remove `title` fields from fixtures and assertions.

### Phase 8: Spec update

- [x] `specifications/fragment-editor.md` line 19: remove `title` from the metadata editing list; note that `key` (editable via rename) is the fragment's display name.
- [x] `specifications/fragment-model.md`: update throughout to remove `title` as a named field:
  - "What a fragment is" section: remove the `**Title**` bullet; replace with `**Key**` — the filename stem, the user-facing identity, editable via rename.
  - Lifecycle creation step: replace "title + content required" with "key + content required".
  - Constraints section: update "Filename and title may change; UUID cannot." → "Filename and `key` may change; UUID cannot."
  - Acceptance criteria: remove `title` from the newly-created fragment field list; add `key`.
- [x] Add a Prior Decisions entry to `specifications/fragment-model.md` referencing this plan.
