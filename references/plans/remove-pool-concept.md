# Remove Pool Concept

**Date**: 20-04-2026
**Status**: Done
**Implemented At**: 20-04-2026

## Why

The pool concept introduced unnecessary complexity and a persistent divergence problem: a fragment's `pool` frontmatter field and its filesystem location could disagree, with no reliable way to resolve the conflict. The states it modelled (`unprocessed`, `incomplete`, `unplaced`) are either redundant or better derived from actual data — completeness from field presence, placement from sequence membership. Keeping an explicit `pool` property meant managing state that should not need to be managed at all.

## Goal

Remove the `pool` field entirely from the fragment model. Keep the `discarded` functionality — but drive it exclusively from filesystem location (`fragments/discarded/`), not from a `pool` property.

The states `unprocessed`, `incomplete`, `unplaced` are removed with no replacement for now. Completeness and placement are deferred to future work.

---

## What changes

### 1. Shared types — `packages/shared`

- Delete `packages/shared/src/types/domain/pool.ts`
- Remove `pool` field from `Fragment` type in `fragment.ts`
- Remove `Pool` import from `fragment.ts`

---

### 2. API schemas — `packages/api/src/schemas/fragment.ts`

- Remove `PoolSchema`
- Remove `pool` from `IndexedFragmentSchema`, `FragmentSchema`, `FragmentCreateSchema`, `FragmentUpdateSchema`
- Remove `FragmentPoolQuerySchema`

---

### 3. API routes — `packages/api/src/routes/fragments.ts`

- Remove pool query param handling (the `pool` branch in `GET /fragments`)
- Remove `pool` from POST body destructuring and fragment creation
- Remove `Pool` import

---

### 4. DB schema — `packages/storage/src/db/vault/schema.ts`

- Remove `pool` column from `fragmentsTable`
- Remove `fragments_pool_deleted_at_idx` index

Write a new migration:

- `ALTER TABLE fragments DROP COLUMN pool;`
- `DROP INDEX IF EXISTS fragments_pool_deleted_at_idx;`

New migration file: `packages/storage/src/db/vault/migrations/20260420_remove_pool.sql`

---

### 5. Indexer — `packages/storage/src/indexer/`

**`types.ts`**

- Remove `pool` from `IndexedFragment`
- Remove `findByPool` from `VaultIndexer` interface
- Remove `Pool` import

**`indexer.ts`**

- Remove `findByPool` implementation
- Remove `Pool` import

**`upserts.ts`**

- Remove `pool` from insert/update payloads

**`assemblers.ts`**

- Remove `pool` from row assembly
- Remove `Pool` import

---

### 6. Storage service — `packages/storage/src/service/storage-service.ts`

- Remove `findByPool` method from fragments namespace
- Remove `Pool` import

---

### 7. Vault/mapper — `packages/storage/src/vault/markdown/mappers/fragment.ts`

- Remove `derivePool` function entirely
- Remove `pool` from returned Fragment object
- Remove `pool` from frontmatter write (serialization)
- Remove `Pool` import

Delete `hasRequiredFields` — it has no callers outside `derivePool`.

---

### 8. Vault — `packages/storage/src/vault/markdown/vault.ts`

- Remove pool/folder conflict detection and warning (lines ~102–115)
- Keep the folder routing logic for discarded: file path check `filePath.startsWith("discarded/")` stays — this is now the **sole source of truth** for discarded state
- Remove `pool: "discarded"` frontmatter write in `discard()` — folder move is sufficient
- Remove `Pool` import

---

### 9. Watcher — `packages/storage/src/watcher/watcher.ts`

- Remove `poolOverride` parameter passed to mapper (currently hardcodes `"discarded"` for files in `discarded/`)
- The mapper/vault layer should derive discarded from path directly — no override needed

---

### 10. Init — `packages/storage/src/vault/markdown/init.ts`

- Remove `pool: "unprocessed"` from default frontmatter on fragment creation
- Remove `pool` from serialized frontmatter

---

### 11. Frontend — `packages/frontend/src/`

**`fragment-metadata-form.tsx`**

- Remove `POOL_OPTIONS` constant
- Remove `pool` from form schema and default values
- Remove pool selector UI block (lines ~163–183)
- Remove `pool` from update payload

**`fragment-metadata.tsx`**

- Remove `<MetadataProperty label="Pool" ... />` line

**`fragment-list.tsx`**

- Remove `[{fragment.pool}]` from list item display
- Discarded fragments are still shown in the list, but visually distinct — e.g. muted/strikethrough styling and a "Discarded" badge. Do not hide them.

**`fragment-editor.tsx` (or wherever the editor toolbar/actions live)**

- Add a "Discard" button that calls `DELETE /projects/:id/fragments/:id/discard` (or equivalent discard endpoint)
- Button should only be visible when the fragment is not already discarded
- When the fragment is discarded, show a "Restore" button instead (calls the restore endpoint)
- The editor itself should be visually marked as discarded (e.g. a banner or muted overlay) when `isDiscarded` is true

Regenerate API client after API schema changes (so generated types in `packages/frontend/src/api/generated/` stay in sync).

---

### 12. Test fixtures — `packages/test-fixtures/`

- Remove `pool: unplaced` (and any other pool frontmatter) from all `.md` fixture files:
  - `fragments/the-bridge.md`
  - `fragments/discarded/the-window.md`
  - `fragments/late-winter.md`
  - `fragments/harbour-lights.md`
  - `fragments/old-beginning.md`

---

### 13. Tests — `packages/storage/src/__tests__/` and `packages/api/src/__tests__/`

**`mappers/fragment.test.ts`**

- Remove pool field from fixtures
- Remove pool assertion and pool-derivation test cases
- Keep serialization tests, just remove pool from expected output

**`vault.test.ts`**

- Remove "sets pool to discarded" and "overrides pool" test cases
- Keep the discard test — assert that the file moves to `fragments/discarded/`, not that `pool === "discarded"`

**`indexer.test.ts`**

- Remove `findByPool` test suite entirely

**`storage-service.test.ts`**

- Remove `findByPool` call and pool assertions

**`routes/fragments.test.ts`**

- Remove pool filter test
- Remove `pool` from request bodies and response assertions

---

### 14. Documentation — `packages/api/README.md`

- Remove pool query param from `GET /fragments` docs
- Remove `pool` from POST body example

---

## How discarded works after this change

| Concern                | Before                                           | After                                     |
| ---------------------- | ------------------------------------------------ | ----------------------------------------- |
| Is fragment discarded? | `fragment.pool === "discarded"`                  | `filePath.startsWith("discarded/")`       |
| Discard action         | Move file + set `pool: discarded` in frontmatter | Move file only                            |
| Frontmatter field      | `pool: discarded` written on discard             | Nothing written — folder is authoritative |
| Divergence possible?   | Yes (pool field vs folder mismatch)              | No (single source of truth)               |

Add `isDiscarded: boolean` to the `IndexedFragment` type and API response schemas. Derive it at index time from `filePath.startsWith("discarded/")` and store it as a DB column (`is_discarded` boolean, not null). The frontend needs this to render discarded fragments differently and to conditionally show the Discard/Restore button.

---

## Order of execution

1. Shared types + API schemas (unblocks type errors everywhere)
2. DB migration
3. Storage layer (schema → indexer → service → vault → watcher → init)
4. API routes
5. Frontend (after API client regeneration)
6. Tests and fixtures
7. Docs

---

## Out of scope

- `isComplete` derived state — deferred
- `isPlaced` / sequence membership — deferred until sequencer is implemented
- Any UI for filtering by discarded status — deferred
