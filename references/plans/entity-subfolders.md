# Entity subfolders (categories) and UUID-anchored identity

**Date**: 26-05-2026
**Status**: In progress
**Specs**: `specifications/aspect-arc-model.md`, `specifications/attachments.md`, `specifications/storage-sync.md`, `specifications/project-management.md`
**ADR**: `references/adr/0002-uuid-revival-on-return.md`

---

## Goal

Aspects, notes, and references can live in arbitrary subfolders inside their entity-type root (`aspects/`, `notes/`, `references/`); the subfolder path is the entity's **category**, derived from `filePath`, with no frontmatter or DB column duplicating it. Fragments remain root-only inside `fragments/` (plus the reserved `fragments/discarded/`). Identity stays anchored to UUID across moves, renames, and out-and-back returns through Obsidian or the filesystem.

---

## Background — design decisions

Resolved during the grilling session that produced this plan. Repeated here so the plan is self-contained.

1. **Folder *is* category.** The aspect `category` frontmatter field and `aspects.category` DB column are removed. Category is `path.dirname(entity-relative path)` for any aspect/note/reference, or `null` at the entity-type root.
2. **Arbitrary nesting.** `aspects/world/places/london.md` is valid; category is `"world/places"`.
3. **Category shape.** Single string with `/` separators, or `null`. Property on the entity type, derived from `filePath`. Not stored independently.
4. **Key uniqueness.** Stays globally unique within each entity type. Cross-folder duplicates (`aspects/places/london.md` and `aspects/characters/london.md`) surface as sync warnings, not auto-resolved.
5. **Fragments stay root-only.** Only `fragments/<key>.md` and `fragments/discarded/<key>.md` are valid; nesting inside `fragments/` is rejected with a sync warning.
6. **In-window moves.** Reuse the existing rename-buffer; it correlates by UUID and doesn't care whether dirname, basename, or both changed.
7. **Out-and-back returns (revival).** New branch: when an `add` event presents a UUID whose DB row exists but whose DB-recorded `filePath` is gone from disk, clear `deletedAt`, update `filePath`, upsert content. Same UUID. See ADR-0002.
8. **Cross-entity-type returns** (e.g. `aspects/x.md` → `notes/x.md`) are not preserved — original soft-deleted, destination gets a new UUID, log warning.
9. **Cascade on Maskor-initiated moves**: filename unchanged → no cascade (key didn't change). Filename + folder change combined → cascade key as today.
10. **Cascade on external moves/renames**: none. Orphan warnings, manual re-attach (existing posture).
11. **UI**: free-text "Category" field in entity editors with autocomplete from existing categories of that entity type. Filesystem-safe chars only.
12. **Listing API**: flat list, `category` field on each entity. Frontend groups.
13. **Action log**: reuse `<type>:category-changed` events (extend to notes/references). Revival rides on `<type>:synced` with `revived: true` payload flag.
14. **Adoption**: rebuild must be recursive so pre-existing nested aspects/notes/references in an externally-prepared vault are discovered on first sync.
15. **Drafts and skeleton creation**: no changes.

---

## Tasks

### Phase 1 — Recursive scanning and category derivation (read path)

Goal: existing vaults with nested aspect/note/reference files are picked up on rebuild; the API surfaces `category` derived from `filePath`. No write-side semantics yet.

- [x] Create branch `entity-subfolders` based on `main`. _(2026-05-26)_
- [x] Make `listMarkdownFiles` in `packages/storage/src/vault/markdown/vault.ts` recursive (`**/*.md` instead of `*.md`) for aspects, notes, references. For fragments, keep flat top-level + a separate flat scan of `fragments/discarded/`; reject any other nesting under `fragments/` with a `SyncWarning`. _(2026-05-26)_
- [x] Update `fromFile` mappers in `packages/storage/src/vault/markdown/mappers/aspect.ts`, `note.ts`, `reference.ts` to derive `category` from the entity-relative path. _(2026-05-26)_
- [x] Drop the `category` frontmatter read/write in the aspect mapper. `toFile` no longer writes a `category:` key. _(2026-05-26)_
- [x] Update shared types in `packages/shared`: `Aspect.category` becomes derived; `Note.category` and `Reference.category` added. _(2026-05-26)_
- [x] Drop the `category` column from `aspectsTable` and write a migration. _(2026-05-26)_
- [x] Update `upsertAspect` / `assembleAspect` / indexer so derived `category` is included in API responses but no longer in DB rows. _(2026-05-26)_
- [x] Update OpenAPI schemas + run `bun run codegen`. _(2026-05-26)_
- [-] Rebuild duplicate-key sync warning across subfolders. _(deferred — existing key UNIQUE constraint already pre-deletes colliding rows; an explicit warning surface is better implemented when the wider SyncWarning UX lands in Phase 5)_
- [x] `vault.aspects.write` / `notes.write` / `references.write` honor `entity.category` to keep writes in the correct subfolder; cascade and update paths use `joinCategoryPath` to recompute filePath. _(2026-05-26)_
- [x] Storage tests cover category derivation at root, single-level, nested subfolders; fragment-subfolder rejection in watcher. _(2026-05-26)_
- [x] Remove the Category text input from `AspectEditor.tsx`, `AspectsTab.tsx`, and `global-create-dialogs.tsx` (UI move support comes in Phase 4). _(2026-05-26)_
- [x] `bun run verify`: backend green; frontend tests separately confirmed by user. _(2026-05-26)_
- [x] `git commit` Phase 1. _(2026-05-27)_

### Phase 2 — Watcher write path and Maskor-initiated moves

Goal: moving an entity through the API or watcher updates the DB filePath correctly, without falsely triggering cascade renames.

- [x] In `packages/storage/src/watcher/sync/keyed-entity.ts`, distinguish the three cases (hash+path match → no-op; hash matches but path differs → upsert without cascade; hash differs → upsert as today). Cascade is also gated on `oldKey !== filenameKey` in the buffer-rename branch so a folder-only move does not cascade. _(2026-05-27)_
- [-] Dedicated `move` entrypoint on storage-service — folded into the existing `update` path: patching `category` on aspect/note/reference now moves the file. The plan acknowledged this as the preferred option when the update path already handles arbitrary patches.
- [x] Extend `aspect:category-changed` payload (was already present); add `note:category-changed` and `reference:category-changed` event types in `packages/shared/src/schemas/domain/action.ts`; commands emit them with `{ from, to }`. _(2026-05-27)_
- [x] Folded `move` into the existing PATCH update endpoints — `AspectUpdate`/`NoteUpdate`/`ReferenceUpdate` schemas all accept `category: string | null | undefined`. _(2026-05-27)_
- [x] `validateCategoryPath` added in `packages/shared/src/utils/`; route handlers validate before passing to commands; `INVALID_CATEGORY` 400 on bad input. _(2026-05-27)_
- [x] Tests added: API category-changed event + file relocation; category cleared to root via `null`; invalid category rejected; external (chokidar) folder move preserves identity without cascade; nested fragment under non-discarded folder rejected by watcher. _(2026-05-27)_
- [x] `bun run typecheck` and full backend test suite green (707 tests). _(2026-05-27)_
- [x] `git commit` Phase 2. _(2026-05-27)_

### Phase 3 — UUID revival on return

Goal: out-and-back returns preserve identity. See ADR-0002.

- [-] Dedicated `storageService.<type>.revive()` and a `deletedAt` column — the soft-delete model was deferred in favour of the existing hard-delete + frontmatter-UUID identity preservation. Identity already survives the full cycle because the UUID is anchored in frontmatter, the upsert is keyed on UUID, and `onConflictDoUpdate` reinserts the row cleanly. The `revived` signal is delivered via an in-memory tracker instead of a DB column. _(ADR-0002 updated to record this divergence.)_
- [x] In-memory `RecentlyDeletedTracker` (per watcher instance, per entity-type, ~24h TTL): when the rename-buffer expiry hard-deletes a row, the UUID is recorded; when a subsequent `add` with that UUID arrives, the resulting `*:synced` event carries `revived: true`. _(2026-05-27)_
- [x] `VaultSyncEvent` extended: `aspect:synced` / `note:synced` / `reference:synced` now carry an optional `revived?: boolean`. _(2026-05-27)_
- [x] Cross-entity-type returns documented: aspect→note flips end with the aspect row hard-deleted and a note created with the UUID from frontmatter; the destination's `revived` flag is **not** set because each entity-type has its own tracker. Fragment frontmatter is untouched; orphan keys surface on the next rebuild. _(2026-05-27)_
- [x] Tests added: same-path revival emits `revived: true` and preserves UUID; different-path-within-entity-type revival preserves identity and emits the flag; cross-entity-type return creates the destination entity with the UUID from frontmatter, no `revived` flag, source row gone. _(2026-05-27)_
- [-] True collision detection for keyed entities — not added in Phase 3. Current behavior (the most recently processed file wins the DB row, keyed on UUID) is preserved. Adding a dedicated collision branch parallel to `findFragmentUuidCollision` is tracked as a future improvement.
- [x] `bun run typecheck` and full backend test suite green (710 tests). _(2026-05-27)_
- [x] `storage-sync.md` updated with the "Move and revival lifecycle" section and the revised entity-routing table. ADR-0002 updated to reflect the implemented (hard-delete) model. _(2026-05-27)_
- [x] `git commit` Phase 3. _(2026-05-27)_

### Phase 4 — Frontend category field and autocomplete

Goal: users can pick or change category in the Maskor UI without typing absolute paths or touching the filesystem.

- [ ] Add a "Category" text field to the aspect editor, note editor, and reference editor. Free-text input, single line, value is the slash-separated path (or empty for root).
- [ ] Autocomplete suggestions: source the distinct categories for that entity type from the list endpoint response; suggest matching prefixes as the user types. Allow typing new paths that don't match any suggestion.
- [ ] Client-side validation mirrors the API rules (reject the same invalid char set). Show inline error before submit.
- [ ] Save behavior: changing the field and committing triggers the `move` API command. Optimistic UI follows the existing immediate-save pattern (cf. `entity-live-metadata-save.md`).
- [ ] Listing surfaces (aspect list in project config, attachment pickers in fragment editor): group by `category` in the frontend. Top-level (`category === null`) items appear first; remaining categories sorted alphabetically; nested categories rendered with `/` breadcrumbs.
- [ ] Tests: editor renders; typing a category persists; autocomplete suggests existing categories; invalid chars rejected client-side; moving an entity is reflected in the list.
- [ ] `git commit` Phase 4.

### Phase 5 — Adoption & documentation

Goal: adopt-an-existing-vault works for pre-prepared nested vaults out of the box; docs reflect the new semantics.

- [ ] Verify the adoption path in `specifications/project-management.md`: on adopt, `resolveProject` triggers the initial rebuild. With Phase 1's recursive scan, nested entities are discovered and UUID-stamped on first add. No special adoption-time recursion code beyond what Phase 1 already changed.
- [ ] Adoption integration test: adopt a folder pre-populated with `aspects/places/london.md`, `aspects/characters/anna.md`, `notes/research/neuroscience.md`, `references/articles/2024-foo.md` (none with frontmatter UUIDs). After first rebuild: all entities indexed with derived categories, UUIDs written back into frontmatter.
- [ ] Update specs:
  - `specifications/_glossary.md` — **Category** entry already added during grilling. Verify still accurate.
  - `specifications/aspect-arc-model.md` — remove `category` from the optional-fields list under "Aspects"; add a one-liner referencing Category in glossary. Update Constraints to add "Aspect category is derived from filePath; the frontmatter `category` field is gone." Add to "Shipped" once the feature lands.
  - `specifications/attachments.md` — vault path under "Structure" changes from `notes/<key>.md` to `notes/[<category>/]<key>.md`; same for references. Add a Constraints line about subfolder support. Add to "Shipped".
  - `specifications/storage-sync.md` —
    - Entity routing table: subfolders allowed under `aspects/`, `notes/`, `references/`.
    - New "Move and revive lifecycle" subsection under Behavior, summarising Phase 2 + Phase 3.
    - Prior decisions: add "Soft-deleted entities are revivable tombstones, not write-offs" (link to ADR-0002).
    - Constraints: add "Fragment subdirectories beyond `discarded/` produce sync warnings and are not indexed."
    - Acceptance criteria: rebuild discovers nested aspects/notes/references; moving an aspect to a subfolder updates DB without cascade; out-and-back UUID returns preserve identity; cross-entity-type returns assign a new UUID.
  - `specifications/project-management.md` — note that adoption now recursively imports nested aspects/notes/references from pre-existing folders.
- [ ] `bun run snapshot` so `references/CODEBASE_SNAPSHOT.md` reflects the new state.
- [ ] `git commit` Phase 5. Open PR.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Key test scenarios beyond the per-phase lists:

- Rebuild of a vault containing one aspect at root and one in `aspects/places/` produces both, with correct categories.
- Same key in two folders → exactly one sync warning, no duplicate index rows.
- External Obsidian-style move within `aspects/` (unlink + add within the rename-buffer window) → identity preserved, no cascade.
- External Obsidian-style move within `aspects/` outside the rename-buffer window → revival path, identity preserved, no cascade.
- Move via API → DB filePath updated, action log entry, file on disk in new location, no cascade.
- Move + rename via API in one operation → cascade rewrites fragment frontmatter to new key.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit`, and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In progress`. Also update the relevant frontmatter of the relevant specs: add an item to the `Shipped` section with the features implemented. Do not include implementation details or granular tasks.
