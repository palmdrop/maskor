# Fix vault adoption — rebuild mints missing metadata + eager Maskor dirs

**Date**: 29-05-2026
**Status**: Done
**Specs**: `specifications/storage-sync.md`, `specifications/project-management.md`, `specifications/fragment-model.md`
**Closed**: 30-05-2026

---

## Goal

Adopting an existing Obsidian-format folder (containing `fragments/`, `aspects/`, `notes/`, `references/` with **no** frontmatter UUIDs and no `.maskor/`) succeeds end to end: the initial rebuild mints and writes back UUIDs for every entity that lacks one — full canonical frontmatter for fragments, UUID-only for keyed entities — using the **same logic the watcher uses**, all entities are indexed with derived categories, `.maskor/sequences/` and `.maskor/config/` exist, and no SQLite constraint error or noisy "no such file or directory" log occurs. A second rebuild writes nothing (hash-guard idempotent).

---

## Background

Two distinct failures observed when adopting a real metadata-less vault:

1. **Missing Maskor dirs.** `.maskor/sequences/` and `.maskor/config/` are not created on adopt (they are "lazily created"). The YAML lister (`listYamlFiles`, `packages/storage/src/vault/markdown/vault.ts`) hits ENOENT, logs "failed to list yaml files in directory", and returns `[]`. Functionally tolerated, but surfaces as an error to the user.
2. **No UUID minting on rebuild.** Entity mappers read `uuid: frontmatter.uuid as string` (`mappers/aspect.ts`, `fragment.ts`, `note.ts`, reference) — `undefined` when absent. `rebuild()` (`indexer.ts`) upserts into tables whose `uuid` is a `primaryKey()` (NOT NULL) → constraint failure. Crashes on aspects first (rebuild order: aspects → notes → references → fragments).

**Root cause of (2):** the watcher mints + writes back metadata (`ensureUuid` in `watcher/utils/uuid.ts`; `syncFragment` writes back full canonical frontmatter on the adoption branch; `syncKeyedEntity` calls `ensureUuid` = UUID-only). But `chokidar-config.ts` sets `ignoreInitial: true`, so the watcher never sees files already on disk at adopt time. `rebuild()` is the only path that reads them, and it does not mint. The previously documented assumption that "the watcher writes UUIDs back on the first subsequent file event" is false for adoption — there is no such event for pre-existing files.

Confirmed decisions:

- **Adopt all entity types, including fragments.** Files already correctly placed in `fragments/` are adopted (minted + indexed) on rebuild, mirroring the watcher's drop-to-adopt. The fragment **import flow** remains the path for bringing _external_ documents in. This clarifies/reverses `project-management.md` prior decision "Folder content is never auto-imported".
- **Extract + share helpers.** Pull UUID minting + canonical-frontmatter writeback into shared functions used by **both** the watcher and rebuild. Keep `ignoreInitial: true` and rebuild's single-transaction bulk design. Do **not** route the initial scan through the watcher.
- **Eager dirs + quiet ENOENT.** Add `.maskor/sequences/` and `.maskor/config/` to `VAULT_SKELETON_DIRS`; make the markdown/YAML listers stop error-logging on a missing directory.

---

## Tasks

### Phase 1 — Eager Maskor dirs + quiet listers (fixes failure #1)

Self-contained; ships alone.

- [x] Create branch `vault-adoption-rebuild-metadata` based on `main`. _(2026-05-29)_
- [x] Add `join(".maskor", "sequences")` and `join(".maskor", "config")` to `VAULT_SKELETON_DIRS` (`packages/storage/src/utils/vault-skeleton.ts`). `ensureVaultSkeleton` is idempotent and already runs on register (`registry.ts:147`) and on resolve (`storage-service.ts:540`), so this covers create + adopt + repair of older vaults. _(2026-05-29)_
- [x] Confirm creating `.maskor/sequences|config` does not trigger watcher events — chokidar `ignored` regex already excludes dotfiles. No change expected; verify. _(2026-05-29 — chokidar-config `ignored: /(^|[/\\])\..+/` excludes all dotfiles incl. `.maskor/`)_
- [x] Make `listMarkdownFiles` and `listYamlFiles` (`vault.ts`) treat a missing directory (ENOENT) as an empty result **without** logging an error. Keep error logging for genuine failures (permissions, etc.). _(2026-05-29 — extracted shared `scanFiles` helper; ENOENT → quiet `[]`)_
- [x] Tests: skeleton creates both `.maskor/` subdirs; listing a non-existent entity/sequences dir returns `[]` and emits no error log. _(2026-05-29 — registry + storage-service skeleton assertions; vault.test.ts missing-directory suite with a spy logger)_
- [x] `git commit` Phase 1. _(2026-05-29)_

### Phase 2 — Extract shared mint + writeback helpers (refactor, no behavior change)

- [x] Extract the fragment adoption writeback (currently inline in `syncFragment`, the `wasAssigned` branch) into a shared helper alongside `ensureUuid`: given a parsed file with a freshly-minted UUID, serialize the **full canonical frontmatter** via `fragmentMapper.toFile` and write it back, returning the rewritten raw content. The keyed-entity case already reduces to `ensureUuid` (UUID-only writeback) — keep using it. _(2026-05-29 — `writeBackFragmentFrontmatter` returns `{ fragment, rawContent }` so callers reuse the same entity for the upsert)_
- [x] Refactor `syncFragment` to call the extracted helper so the watcher and rebuild share one implementation. No behavior change for the watcher. _(2026-05-29 — adoption branch now one call; removed the now-unused `serializeFile` import)_
- [x] Decide the helper's home (e.g. `watcher/utils/uuid.ts` is watcher-scoped; consider a neutral location both the watcher and indexer import without a layering smell). Note any module-boundary concern. _(2026-05-29 — moved `ensureUuid`/`assignNewUuid` + the new helper into `vault/markdown/adopt.ts`; the markdown layer is imported by both watcher and indexer, avoiding an indexer→watcher dependency. Deleted `watcher/utils/uuid.ts`.)_
- [x] Tests: existing watcher adoption tests stay green; add a direct unit test of the extracted helper (mint → full frontmatter for fragments; mint → UUID-only for keyed entities; returned raw content hashes consistently). _(2026-05-29 — `__tests__/adopt.test.ts`; full storage suite 349 pass)_
- [x] `git commit` Phase 2. _(2026-05-29)_

### Phase 3 — Rebuild mints missing metadata (fixes failure #2)

- [x] In `rebuild()` Phase 1 (the async read), for every entity (fragment, aspect, note, reference) whose file lacks a frontmatter UUID, mint + write back using the Phase 2 helpers, and feed the **rewritten raw content** (and the post-writeback entity) into the upsert so the stored `contentHash` matches what is on disk. _(2026-05-29 — implemented in the vault `readAllWithFilePaths` methods (the rebuild's only input); the vault owns FS paths + parsing, so the indexer stays free of FS/adoption logic)_
- [x] Apply to all four entity types, including fragments (per the adopt-all decision). Keep rebuild's single transaction for the DB writes; file write-backs happen in the async read phase, before the transaction. _(2026-05-29 — shared `readAdoptedKeyedEntities` helper for aspect/note/reference; fragments get full canonical frontmatter via `writeBackFragmentFrontmatter`. Sequences excluded — Maskor-owned.)_
- [x] Files that already carry a UUID are left untouched on disk (DB upsert only) — no normalization churn, consistent with the watcher. _(2026-05-29 — `ensureUuid` returns `wasAssigned: false` and the original raw content untouched)_
- [x] Confirm lock safety: `rebuild()` is intentionally outside `withVaultWriteLock` (runs in `resolveProject` before any user write, and inside `drafts.restore` which already holds the lock). Writing back during rebuild is safe in both; document the reasoning where the write-back is introduced. _(2026-05-29 — no change to lock model; initial rebuild runs before the watcher starts, restore holds the lock)_
- [x] Idempotence: a second rebuild over a now-stamped vault performs no file writes (every file has a UUID); the hash-guard makes any later watcher event a no-op. _(2026-05-29 — test asserts byte-identical files across two rebuilds)_
- [x] Tests: see Testing section. _(2026-05-29 — no-UUID adoption + idempotence cases added to `indexer.test.ts`; full backend suite green)_
- [x] `git commit` Phase 3. _(2026-05-29)_

### Phase 4 — Spec + docs reconciliation

- [x] `specifications/project-management.md`: remove the **Known gap (2026-05-29)** note added this session; update the adoption paragraph to state that all entity types (incl. fragments) are adopted on the first rebuild with UUIDs minted + written back; revise the "Folder content is never auto-imported" prior decision to distinguish **adoption** (files already in the entity folders, incl. `fragments/`) from **import** (external documents); add `.maskor/sequences/` and `.maskor/config/` to the "Init on create" skeleton list; update the "lazily created" wording. Add a `Shipped` entry. _(2026-05-30)_
- [x] `specifications/storage-sync.md`: state that rebuild mints + writes back UUIDs (full canonical frontmatter for fragments, UUID-only for keyed entities) for files lacking one; update the skeleton/dir-creation note (no longer fully lazy); expand acceptance criteria (adoption of a no-UUID vault succeeds; rebuild is idempotent). Add a `Shipped` entry. _(2026-05-30)_
- [x] `specifications/fragment-model.md`: align the "Raw markdown adoption" wording so it also covers adoption via the initial rebuild, not only the watcher. Add a `Shipped` entry if behavior changed materially. _(2026-05-30 — wording aligned; no separate Shipped entry, the model itself is unchanged — mechanics live in storage-sync)_
- [x] `references/plans/entity-subfolders.md`: the **Correction (2026-05-29)** note added this session can reference this plan as the fix. _(2026-05-30)_
- [x] `bun run snapshot` to refresh `references/CODEBASE_SNAPSHOT.md`. _(2026-05-30)_
- [x] Set this plan's `Status` to `Done`; `git commit` Phase 4. Open PR. _(2026-05-30)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The existing `entity-subfolders` Phase 5 adoption test is insufficient — its fixtures carried **pre-assigned frontmatter UUIDs**, masking this entire failure. New adoption tests must use a vault with **no** frontmatter UUIDs and no `.maskor/`:

- Adopt a folder pre-populated with `fragments/intro.md`, `aspects/places/london.md`, `aspects/characters/anna.md`, `notes/research/neuroscience.md`, `references/articles/2024-foo.md`, **none** carrying a UUID. After rebuild:
  - No SQLite constraint error; rebuild completes.
  - Every file has a UUID written back to disk.
  - Fragments have **full** canonical frontmatter (uuid, updatedAt, readiness, notes, references); keyed entities have a UUID added, other fields untouched.
  - All entities indexed; categories derived from subfolder paths.
  - `.maskor/sequences/` and `.maskor/config/` exist; no "failed to list yaml files" error logged.
- Idempotence: a second rebuild writes no files and changes no hashes.
- Partial frontmatter on a keyed entity (e.g. a `color:` but no `uuid`) is preserved with the UUID added.

---

## Notes

- **Out of scope / deferred:** duplicate-frontmatter-UUID collision detection during rebuild for keyed entities. `entity-subfolders.md` Phase 5 already deferred keyed-entity collision detection; the rebuild upsert is keyed on UUID (silent last-write-wins). Fresh Obsidian vaults carry no Maskor UUIDs, so collisions at adopt are unlikely. The watcher's `findFragmentUuidCollision` path for fragments is unchanged.
- `updatedAt`: mirror the watcher exactly. Fragment `toFile` writes `updatedAt`; the resolved storage-sync open question is that files without `updatedAt` take sync time. Do not introduce new drift.
- Do not flip `ignoreInitial` — the initial scan stays owned by `rebuild()`; both paths share the extracted helpers instead.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
