---
name: Drizzle ORM anti-patterns in this codebase
description: Confirmed bugs and pitfalls with Drizzle ORM + bun:sqlite observed in the storage package
type: project
---

Confirmed as of 2026-04-12 (vault-watcher review adds new entries below):
Confirmed as of 2026-04-05 (vault-content-index review):

- **`isNull(col) && notInArray(col, arr)` is silently wrong.** Drizzle SQL objects are truthy JS values — `&&` returns the right-hand side, dropping `isNull()`. Use `and(isNull(col), notInArray(col, arr))`.
- **`notInArray(col, [])` is a no-op in SQLite.** `NOT IN ()` always evaluates true, returning all rows. Guard with `uuids.length > 0` or use `inArray()` for inclusive filtering.
- **bun:sqlite is synchronous.** Marking Drizzle helpers `async` with no `await` is misleading — comment if intentional.
- **No transaction on multi-step writes.** Each `.run()` is its own fsync under SQLite autocommit. Wrap bulk rebuilds in `vaultDatabase.transaction(async (tx) => { ... })`.

**Why:** These pass TypeScript type-checking — Drizzle SQL objects are opaque types, so `&&` vs `and()` is invisible to the compiler.

**How to apply:** On any Drizzle WHERE clause with multiple conditions, verify `and()`/`or()` wrappers. Check transaction boundaries on multi-step writes.

Also from 2026-04-12:

- **Soft-delete helpers omit `deletedAt IS NULL` guard.** `UPDATE ... SET deletedAt = NOW() WHERE filePath = ?` re-stamps already-deleted rows, changing their `deletedAt` timestamp silently. Always add `and(..., isNull(col.deletedAt))` to soft-delete WHERE clauses.
- **Duplicated DB query helpers diverge in correctness.** `loadAspectKeyToUuid` exists in both `watcher.ts` and `storage-service.ts`; the watcher copy omits the `isNull(deletedAt)` filter. Shared query helpers that are copy-pasted will drift. Put them in one place and import.
