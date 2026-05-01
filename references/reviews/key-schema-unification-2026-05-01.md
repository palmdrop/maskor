# Review: Phase 5b — Key Schema Unification

**Date**: 2026-05-01
**Scope**: `packages/shared`, `packages/storage`, `packages/api`, `packages/frontend`
**Plan**: `references/plans/project-config-page.md` (Phase 5b)

---

## Overall

The mechanical rename (`title` → `key`, `name` → `key`) is thorough and consistent across all layers — schemas, DB migration, vault mappers, indexer, assemblers, upserts, API routes, and frontend. The DB migration follows the correct SQLite table-recreation pattern and preserves all data. One significant omission: `validateEntityKey` was created but never wired in to any write path, leaving the `::` check completely unenforced. There's also a missing guard against `/` in keys, which would silently corrupt the vault file layout.

---

## Bugs

### 1. `validateEntityKey` is dead code — `::` check is never enforced

`packages/shared/src/utils/validate-entity-key.ts` — The utility exists and is exported, but is not called anywhere: not in the API routes, not in the storage service `write()` methods, not in any create/update path. The plan explicitly states it should be "used by all three create/update paths."

```
POST /notes { key: "weight::factor" }
  → route: destructures key, constructs Note, passes to storage
  → storage.write(): only checks case-insensitive uniqueness
  → vault writes notes/weight::factor.md
  → Obsidian treats "weight::factor" as an inline field in any file referencing it
```

The `::` rejection is the entire reason this utility was introduced. Fix: call `validateEntityKey(key)` in the API route handlers (or at the top of `notes.write` / `references.write` / `aspects.write`) and map the thrown `Error` to a 400 response.

### 2. Keys containing `/` produce subdirectory file paths

`packages/storage/src/vault/markdown/vault.ts:1137`, `1146` — A key like `"city/harbour"` produces `notes/city/harbour.md`. If `notes/city/` doesn't exist the write fails silently (Bun will throw on `writeMarkdown`). If it happens to exist, the file lands in a subdirectory the indexer never reads, making the entity invisible after creation.

`validateEntityKey` only rejects `::` and empty strings. A forward-slash guard is missing. Fix: add a `/` (and `\` for Windows) rejection in `validateEntityKey`, or add it as a separate check in the write path.

**Suggestion — switch to an allowlist instead of a blocklist:** Rather than enumerating forbidden characters, restrict keys to a safe set: alphanumeric characters, spaces, hyphens, and underscores (`/^[a-zA-Z0-9 _-]+$/`). This is stricter by default and future-proof — any character not in the allowlist is rejected without needing an explicit rule. Covers `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, and everything else that could cause filesystem or parsing problems in one shot.

---

## Design

### 3. Uniqueness check in `update()` duplicates the check in `write()`

`packages/storage/src/service/storage-service.ts:984–994` (notes), `1036–1046` (references) — `update()` manually queries all notes/references to check case-insensitive uniqueness before calling `write()`. But `write()` already performs the same check unconditionally. The `update()` guard is redundant — it fires, then `write()` fires again with the same data.

This isn't wrong, but it does two index reads where one suffices and makes the uniqueness logic harder to follow. The outer check in `update()` can be removed; the one inside `write()` is the authoritative guard.

---

## Minor

### 4. `validateEntityKey` throws plain `Error`, not `VaultError`

`packages/shared/src/utils/validate-entity-key.ts:4,7` — If this utility is ever called from a storage write path, the thrown `Error` won't be matched by `throwStorageError()` in the API layer and will surface as an unhandled 500 instead of a 400. The function should either throw a `VaultError("KEY_CONFLICT", ...)` (requires moving it to the storage package) or be called at the API route layer before storage is involved, with manual 400 handling.

### 5. Journal `when` timestamp is from 2025, not 2026

`packages/storage/src/db/vault/migrations/meta/_journal.json` — The new entry has `"when": 1746057600000`, which is approximately 2025-04-30 UTC. The other journal entries are in the 2026 range (`1777009396160`). Cosmetic-only, doesn't affect migration ordering (Drizzle uses the `tag`), but inconsistent with the project's fictional date.

---

## Non-issues

- **Generated types already use `key`** — `maskorAPI.schemas.ts` had `IndexedNote.key`, `Note.key`, `IndexedReference.key`, `Reference.key` before Phase 5b. The API Zod schema changes in Phase 5b align runtime validation with the already-correct generated types.
- **`slugify` import retained** — still used for fragment filename generation; the plan explicitly says to keep it.
- **DB unique index is case-sensitive** — The app-layer check is case-insensitive; the DB index is not. This means vault-edited files with case-variant keys can both be indexed. Acceptable: the API blocks new writes correctly, and the watcher path is a known "eventually consistent" surface.
- **`aspects.write` uniqueness check** — reads all aspects before writing, consistent with notes/references pattern. Aspects don't have a separate `update()` key-change funnel, so the check belongs here.
