# Resilient rebuild, invalid-file warnings, and manual DB reset

**Date**: 01-06-2026
**Status**: Todo
**Specs**: `specifications/storage-sync.md`

---

## Goal

A single unparseable vault entity no longer wedges the index: rebuild skips the bad file, indexes everything else, and reports each failure as an `INVALID_ENTITY_FILE` vault warning the user sees in the Diagnostics tab (and that clears when the file is fixed). Separately, a manual **Reset database** button on the project config page drops and re-derives the vault DB on demand for the cases rebuild can't repair (DB-level corruption / drift), and both rebuild and reset surface genuine failures in the UI instead of silently doing nothing.

---

## Background

Three problems surfaced while reviewing the dev DB auto-reset (`references/plans/dev-db-auto-reset.md`):

1. **Rebuild is all-or-nothing.** `index.rebuild` (`packages/storage/src/indexer/indexer.ts:73`) reads entities with `Promise.all(files.map(read))`; one `VaultError` from `read` (`packages/storage/src/vault/markdown/vault.ts`) rejects the entire rebuild. An invalid vault file blocks indexing of every other entity.
2. **The rebuild button is silent on failure.** It dispatches `config:rebuild-index`, which calls `rebuildIndex.mutate(...)` fire-and-forget with no `onError`/result handling (`packages/frontend/src/pages/ProjectConfigPage/tabs/GeneralTab.tsx:27`). The route returns a 500 (`packages/api/src/routes/vault-index-routes.ts:36`) but the UI drops it — "nothing happens, no error".
3. **No manual recovery for a broken DB.** Rebuild re-derives _contents_ through the live schema; it cannot repair schema drift, a half-failed migration, or a corrupt `.db` file. The dev auto-reset can, but it is startup-only, env-flag-gated, and fingerprint-triggered — there is no on-demand control.

The vault-warnings infrastructure already exists (`references/plans/remove-piece-concept-and-vault-warnings.md`, Done): `vault_warnings` table, `SyncWarning` union (`packages/storage/src/indexer/types.ts`), `warnings-repo` with `STATE_WARNING_KINDS` / `CATEGORY_BY_KIND`, the `vault:warning` SSE event, and the `DiagnosticsTab` inspector. Invalid-file reporting wires into it as a new **state** warning kind — re-detected on rebuild, cleared when fixed, no new surfacing UI required.

The manual reset reuses the draft-restore teardown machinery (`packages/storage/src/service/storage-service.ts:1934`): draft mutex + write lock → stop watcher → `closeRawVaultDatabase` → drop cached drizzle wrapper / indexer / watcher → recreate → rebuild → restart watcher. The delete primitive already exists (`deleteDatabaseFiles` in `packages/storage/src/db/schema-fingerprint.ts`, currently unexported).

### Decisions taken (during design discussion)

- **Resilience lives in the shared read method.** `readAllWithFilePaths` returns `{ entities, failures }` rather than adding a parallel method — only rebuild consumes it (5 call sites in `indexer.ts`, plus tests). The watcher syncs files individually and is unaffected.
- **Never auto-rewrite an unparseable file.** Auto-fix is strictly for the _parseable-but-incomplete_ class (missing uuid / partial frontmatter), already handled by the adoption path (`adopt: true`; see `references/plans/vault-adoption-rebuild-metadata.md`). A file we cannot parse is reported and warned only — any "fix" would be guesswork that risks destroying user content.
- **`onError` is for genuine failures; invalid files flow through Diagnostics.** With resilient rebuild a bad file no longer fails the rebuild, so the expected "invalid file" feedback appears as a warning, not a toast. `onError` on rebuild/reset remains for real DB/IO failures.

---

## Tasks

### Phase 0: Branch

- [x] No new branch — continue on the existing `dev-db-auto-reset` branch (related work already lives here, per developer instruction). _(2026-06-01)_

### Phase 1: Resilient rebuild + `INVALID_ENTITY_FILE` warning (storage)

- [x] Change `readAllWithFilePaths` (all five entity readers in `packages/storage/src/vault/markdown/vault.ts`) to read each file fault-tolerantly and return `{ entities, failures }`, where each failure carries the entity-relative `filePath` and the parse error message. Adoption write-back stays unchanged for files that _do_ parse. _(2026-06-01)_
- [x] Add `INVALID_ENTITY_FILE` to the `SyncWarning` union (`packages/storage/src/indexer/types.ts`) — payload: `filePath`, `entityKind`, `error`. State category. _(2026-06-01)_
- [x] Register the new kind in `STATE_WARNING_KINDS` and `CATEGORY_BY_KIND` (`packages/storage/src/warnings/warnings-repo.ts`); per-file `dedupKey` (the vault-relative file path) so re-detection updates in place. _(2026-06-01)_
- [x] Update `index.rebuild` (`packages/storage/src/indexer/indexer.ts`) to consume the new shape: index parsed entities as today, then — alongside the existing `WRONG_FORMAT_FILE` / `UNKNOWN_ASPECT_KEY` re-detection — insert an `INVALID_ENTITY_FILE` warning per failure (vault-relative path). State warnings are wiped and rebuilt as now, so a fixed file's warning disappears on the next rebuild. _(2026-06-01)_
- [x] **Surprise fixed:** gray-matter caches an empty `{}` for a string that previously threw, so a malformed file would parse-as-empty (and get adopted) on the second rebuild. Fixed `parseFile` to bypass the cache (`matter(rawFile, {})`); logged in `references/suggestions.md`. _(2026-06-01)_
- [-] Add a `failures` count to `RebuildStats` — dropped: the warnings store is the surfacing channel; keeping the rebuild API stable avoids needless OpenAPI churn.

### Phase 2: Incremental `INVALID_ENTITY_FILE` updates in the watcher

- [x] Parse failures in `syncFragment` / `syncKeyedEntity` now throw a typed `VaultError("INVALID_ENTITY_FILE")` (`parseEntityFileOrThrow` in `vault/markdown/parse.ts`). The watcher's `handleAddOrChange` records the warning + emits `vault:warning` on that error, clears it on a successful sync, and `handleUnlink` clears it on removal — mirroring the route-aware `WRONG_FORMAT_FILE` handling. Routes carry an `entityKind`. _(2026-06-01)_
- [x] Confirmed an unparseable file is **never** rewritten by the watcher — the throwing parse runs before any `ensureUuid`/writeback. Covered by a test asserting on-disk bytes are unchanged. _(2026-06-01)_

### Phase 3: Manual DB reset primitive (storage)

- [x] Exported `deleteDatabaseFiles` from `schema-fingerprint.ts` and added `deleteVaultDatabaseFiles(vaultRoot)` to `db/vault/index.ts` (keeps the DB path private, reuses the primitive). _(2026-06-01)_
- [x] Added `index.reset(context)` to the storage service mirroring `drafts.restore` teardown: draft mutex + vault write lock → stop watcher → `closeRawVaultDatabase` → drop `vaultDatabaseCache` / `vaultIndexerCache` / `vaultWatcherCache` → `deleteVaultDatabaseFiles` → rebuild via the lazily-recreated `getVaultIndexer` (fresh `migrate()` + fingerprint stamp) → restart watcher → emit `vault:reset`. _(2026-06-01)_
- [x] Reset is **not** gated by `MASKOR_DB_AUTO_RESET` (explicit user action). New `vault:reset` SSE event added to `@maskor/shared` events + the frontend `useVaultEvents` list (broad invalidation). _(2026-06-01)_
- [x] Scope: vault DB only. Registry reset stays out of scope. _(2026-06-01)_

### Phase 4: API — reset route + error propagation

- [ ] Add `resetDatabaseCommand` under `packages/api/src/commands/` (state-changing ops go through the commands pipeline per `packages/api/CLAUDE.md`) and a `POST /projects/:projectId/index/reset` route calling it via `executeCommand`.
- [ ] Confirm the rebuild route already surfaces failures correctly (it does, via `throwStorageError`); no change needed beyond the frontend wiring in Phase 5.
- [ ] `bun run codegen` to refresh the OpenAPI snapshot + generated client (new route; new `VaultWarning` union member from Phase 1).

### Phase 5: Frontend — reset button, error surfacing, Diagnostics render

- [ ] Add a `config:reset-database` command (project-config scope, `packages/frontend/src/lib/commands/scopes/project-config.ts`) wired to the generated reset mutation, behind a confirm dialog. Dialog copy **reuses the auto-reset wording**: discards `fragment_stats` telemetry and dismissed `UUID_COLLISION` warnings.
- [ ] Add the **Reset database** button to `GeneralTab.tsx` as a second, clearly-distinct button beside the existing **Rebuild index** (destructive styling). Do not change the existing rebuild button's behavior.
- [ ] Surface genuine failures for both commands: add `onError` handling so a failed rebuild/reset renders an error (not silent). Invalid-file feedback continues to flow through the Diagnostics tab, not the toast.
- [ ] Render `INVALID_ENTITY_FILE` in `DiagnosticsTab.tsx` — grouped like other state warnings, showing file path + parse error + a fix hint. State warning → no Dismiss button (clears on fix). `useWarnings` already live-invalidates on `vault:warning`.

### Phase 6: Spec + suggestions

- [ ] Update `specifications/storage-sync.md`: rebuild is fault-tolerant per entity; invalid files are reported as `INVALID_ENTITY_FILE` state warnings and never auto-rewritten; document the manual `index.reset` and the on-demand Reset database button. Add both to the `Shipped` section.
- [ ] Add a `references/suggestions.md` entry for the original silent-failure root cause (rebuild button `.mutate` fire-and-forget) if not fully closed by Phase 5.

### Phase 7: Commit

- [ ] `bun run format` then `bun run verify`; fix issues.
- [ ] `git commit` in logical batches (storage / API / frontend) with descriptive messages.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Rebuild with one unparseable entity → other entities still indexed; one `INVALID_ENTITY_FILE` warning recorded with the right path; row counts reflect the survivors.
- Fixing the bad file + rebuild → warning cleared (state-warning re-detection).
- An unparseable file is never rewritten on disk by rebuild or the watcher.
- Watcher: dropping an unparseable file records the warning + emits `vault:warning`; a corrected re-save clears it.
- `index.reset` → DB files dropped, recreated, migrated, fingerprint stamped, and repopulated; fragment/aspect/note/reference/sequence counts match the vault afterward; watcher live again.
- Reset route goes through the command pipeline and returns updated state; a genuine failure path returns an error the frontend renders.
- Frontend: Reset database button opens a confirm dialog; rebuild/reset `onError` renders a message; `DiagnosticsTab` shows `INVALID_ENTITY_FILE` rows with no Dismiss button.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

Per developer instruction, this work continues on the existing `dev-db-auto-reset` branch — do **not** create a new branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. ALSO update the relevant frontmatter of the relevant specs — add an item to the `Shipped` property with the features implemented. Do not include implementation details or granular tasks.
