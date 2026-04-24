# Plan: Storage Sync Spec Fixes

**Date**: 22-04-2026
**Status**: Done
**Implemented At**: 23-04-2026

Actionable fixes identified during storage-sync spec extraction. Each item is a discrete, independently shippable change.

---

## 1. Remove `version` field

The `version` frontmatter field serves no user-facing purpose. Remove it entirely.

- `packages/shared/src/types/domain/fragment.ts` — remove `version` field from `Fragment`
- `packages/storage/src/vault/markdown/mappers/fragment.ts` — remove `version` from parse and serialize
- `packages/storage/src/vault/markdown/vault.ts` — remove `version` increment on write
- `packages/storage/src/db/vault/schema.ts` — remove `version` column from `fragmentsTable`; write migration to `DROP COLUMN version`
- `packages/storage/src/indexer/` — remove `version` from `IndexedFragment`, upserts, assemblers
- `packages/test-fixtures/` — remove `version:` from all fixture fragment files
- `packages/api/src/schemas/fragment.ts` — remove `version` from all fragment schemas
- Update `references/SYNC_CONTRACT.md` and `references/ARCHITECTURE.md` to remove `version` from field ownership tables

---

## 2. Fix `filePath` comment in vault DB schema

The SQL comment in `packages/storage/src/db/vault/schema.ts` (and the vault-content-index plan) describes `file_path` as "absolute path". It is and must be **relative to vault root**.

- `packages/storage/src/db/vault/schema.ts` — update the `filePath` column comment to "relative to vault root"

---

## 3. Add `updatedAt` to vault frontmatter

`updatedAt` is listed as DB-only in `SYNC_CONTRACT.md` and `ARCHITECTURE.md` but is absent from the actual DB schema. Decision: it should be vault-owned (frontmatter), written by Maskor on every API write so it is user-visible in Obsidian.

- Add `updatedAt` to `Fragment` type in `packages/shared/src/types/domain/fragment.ts`
- Add `updatedAt` to frontmatter parse/serialize in `packages/storage/src/vault/markdown/mappers/fragment.ts`
- Set `updatedAt` on every `StorageService.fragments.write()` call
- Update `references/SYNC_CONTRACT.md` — move `updatedAt` from DB-only to vault (frontmatter); document that it is written by Maskor, not user-editable
- Update `references/ARCHITECTURE.md` field ownership table accordingly
- Add `updatedAt` fixture frontmatter to `packages/test-fixtures/`

---

## 4. Implement per-file piece consume

The watcher currently routes `pieces/` add events to `vault.pieces.consumeAll()`, which consumes all pieces in batch. A per-file handler is required.

- `packages/storage/src/vault/markdown/vault.ts` — implement `vault.pieces.consume(filePath)`: read single piece file, initFragment, delete file
- `packages/storage/src/watcher/watcher.ts` — update `pieces/` add handler to call `vault.pieces.consume(relativePath)` instead of `consumeAll`
- Remove or deprecate the existing suggestion item in `references/suggestions.md` that flags this (entry: "Piece watcher consumes all pieces on single-file add")
- Update `packages/storage/README.md` if it documents the pieces API

---

## 5. Implement rebuild mutex

A watcher event firing mid-rebuild upserts a change that is then overwritten by the stale in-memory snapshot when the transaction commits. Rebuild and watcher must be mutually exclusive.

**Recommended approach:** a simple boolean flag in `StorageService` (or within `VaultWatcher`) that `rebuild()` sets on entry and clears on exit. The watcher checks the flag before processing each event and skips (or queues) events while it is set.

- `packages/storage/src/watcher/watcher.ts` — add `pause()` / `resume()` methods (may already exist from sse plan; verify)
- `packages/storage/src/indexer/indexer.ts` — call `watcher.pause()` before the rebuild transaction and `watcher.resume()` in a `finally` block
- `packages/storage/src/service/storage-service.ts` — wire pause/resume through `service.index.rebuild(context)` if the watcher is accessed via StorageService

---

## 6. Verify server-side rebuild guard

~~Frontend-triggered rebuild~~ — already done; `ProjectShellPage` does not call rebuild.

Remaining work: confirm that rebuild is called server-side exactly once per watcher lifecycle, not on every request.

- Verify that `resolveProject` middleware (or equivalent) calls `storageService.index.rebuild(context)` before `storageService.watcher.start(context)` on first project access
- Confirm `StorageService` tracks watcher-started state per project so repeated requests do not re-trigger rebuild
- Update `references/ARCHITECTURE.md` "Open / unsettled" section — remove the note describing rebuild-on-load as unsettled; it is resolved

---

## 7. Remove `aspect_uuid` from `fragment_properties`

Aspect names are unique within a vault; `aspect_key` is sufficient as the join column. The `aspect_uuid` column adds resolution complexity and a nullable join with no benefit.

- `packages/storage/src/db/vault/schema.ts` — remove `aspectUuid` from `fragmentPropertiesTable`; write a migration to `DROP COLUMN aspect_uuid`
- `packages/storage/src/indexer/types.ts` — remove `aspectUuid` from `IndexedFragmentProperty`
- `packages/storage/src/indexer/upserts.ts` — remove the `Map<aspectKey, uuid>` parameter and all UUID lookup/insert logic; replace with a `Set<aspectKey>` of known keys for drift detection
- `packages/storage/src/indexer/indexer.ts` — build `Set<aspectKey>` during the aspects pass; pass to fragment upsert for drift detection; remove `Map<key, uuid>` construction
- `packages/storage/src/indexer/assemblers.ts` — remove `aspectUuid` from assembled `IndexedFragmentProperty`
- `packages/api/src/schemas/fragment.ts` — remove `aspectUuid` from any fragment property response schemas
- Update `references/SYNC_CONTRACT.md` — remove `aspect_uuid` from the `fragment_properties` description; document that `aspect_key` is the join column
