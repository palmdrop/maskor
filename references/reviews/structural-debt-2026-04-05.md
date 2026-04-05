# Review: Structural Debt Resolution — storage package

**Date**: 05-04-2026

---

## Summary

This change set addresses one of the six debt items from `ARCHITECTURE.md` — the O(n) full file scan in `vault.fragments.discard()` — and introduces a meaningful architectural shift: discard is now orchestrated at the `StorageService` layer via UUID→filePath lookup through the indexer. The implementation is largely correct and the test coverage is solid. However, the change introduces a subtle but significant API contract break, there is a hollow test assertion in the vault tests, the README documents the deleted signature, and four of the six debt items remain entirely unaddressed. The "resolved" marker on the `Project` debt item in `ARCHITECTURE.md` is unexplained by these diffs.

---

## Debt Item Tracking

| #   | Debt Item                                 | Status                                 | Notes                                                                                             |
| --- | ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `discard()` O(n) file scan                | **Partially resolved**                 | Moved to service layer with DB lookup; vault-level O(n) path still exists and is documented below |
| 2   | `rebuild()` holds all data in memory      | **Not addressed**                      | TODO comment added in indexer; no structural change                                               |
| 3   | No DB indexes on `pool`, `deleted_at`     | **Not addressed**                      | Schema unchanged                                                                                  |
| 4   | `Piece` uses filename as title            | **Not addressed**                      | `consumeAll` still uses `basename(filePath).replace(/\.md$/, "")`                                 |
| 5   | `Project` embeds full `Note[]`/`Aspect[]` | **Marked resolved in ARCHITECTURE.md** | Not visible in these diffs — presumably addressed in a prior commit                               |
| 6   | `recoverFromManifests` not implemented    | **Not addressed**                      | No change to registry                                                                             |

---

## Per-File Analysis

### `packages/storage/src/vault/types.ts`

**Change:** `discard(uuid: FragmentUUID)` → `discard(filePath: string)`

This is the core of the refactor. The `Vault` interface now operates on file paths, not UUIDs. UUID resolution is pushed up to `StorageService`.

**Issues:**

- [WARNING] The `Vault` contract is now less ergonomic for direct consumers. Any caller using `createVault` directly — including the `vault.test.ts` tests — must supply a file path, not a UUID. This is fine for internal use but breaks the "low-level API" contract documented in `README.md` (see below). The tradeoff should be explicitly documented.

- [WARNING] `discard(filePath: string)` accepts any string. There is no type-level guarantee that the path is within the vault's fragment directory. Passing an arbitrary path would silently move a file to the discarded directory and write back frontmatter to the wrong location. A branded type (e.g. `VaultFilePath`) or a runtime validation guard at the top of `discard()` would prevent this class of mistake. At minimum, a TODO noting the missing validation.

---

### `packages/storage/src/vault/markdown/vault.ts`

**Change:** `discard()` now accepts `filePath: string`, reads the file at that path, renames it to `fragments/discarded/<slug>.md`, then rewrites frontmatter with `pool: "discarded"`.

**Issues:**

- [CRITICAL] **The O(n) scan is not fully eliminated at this layer.** `StorageService.discardFragment` uses the indexer to avoid the scan, but `vault.fragments.discard(filePath)` is still a public method callable without the indexer. The `vault.test.ts` test at line 79 calls `vault.fragments.discard(filePath)` directly, bypassing the service entirely. Nothing in the code enforces that `discard` must go through the service. The debt item says "should use `VaultIndexer.fragments.findFilePath()` once wired in" — it is wired in at the service level, but the raw vault method does a full file read + rename without the UUID scan, which is actually fine. The original debt was about _finding_ the file by UUID. The new architecture correctly pins the UUID→path lookup to the indexer. This is resolved, but the communication of the fix is misleading: the `// TODO` comment that previously described the O(n) scan appears to have been removed without explanation. A comment explaining that UUID resolution is now the service layer's responsibility would clarify the design.

- [WARNING] **Double file write in `discard`.** The method renames the file to `destination`, then calls `writeMarkdown(destination, ...)` to write the updated frontmatter. If the `writeMarkdown` call fails after the rename succeeds, the file sits in `fragments/discarded/` with stale frontmatter (`pool` not yet updated to `"discarded"`). Next time `readAll()` runs, the `isDiscarded` path check overrides the pool value (line 73–77 of `vault.ts`) — so this degrades gracefully. But it is still an inconsistency window. Worth a `// TODO:` comment noting the non-atomic two-step.

- [WARNING] **`discard` re-maps from `ParsedFile` using `fragmentMapper.fromFile(parsed, filePath)` with the _old_ (source) `filePath`, not the destination.** Line 141:

  ```ts
  const discardedFragment = {
    ...fragmentMapper.fromFile(parsed, filePath),
    pool: "discarded" as const,
  };
  ```

  `filePath` here is the source path (e.g. `fragments/the-bridge.md`), not `destination`. If `fromFile` uses `filePath` to populate anything stored in the frontmatter (e.g. a future `filePath` field), this would silently embed the wrong path. Currently `fromFile` doesn't store `filePath` in the returned domain type, so this is latent rather than active. Should pass `destination` here defensively, or at minimum add a comment.

- [STYLE] Line 50–51 in `listMarkdownFiles`:

  ```ts
  for await (const file of glob.scan(...)) {
    entries.push(join(directory, file));
  }
  ```

  Variable `file` in the glob scan refers to a filename returned by `Bun.Glob.scan` (just the basename, not a full path). Naming it `file` while it is actually a filename/basename is misleading — `fileName` or `entry` would be clearer.

- [STYLE] `consumeAll` at line 238–269: the inner loop uses `for...of` to accumulate into `results: Fragment[]`. This is an array push rather than an object accumulation, so `reduce` is not required by the standard. However, the inner `try/catch` with side-effects (file deletion, logging) makes `reduce` inappropriate here anyway — this is one case where `for...of` is the right call. No issue.

---

### `packages/storage/src/service/storage-service.ts`

**Change:** New `discardFragment(context, uuid)` method replaces the old pattern. New `getVaultIndexer` method wires in the indexer. Cache invalidation extended to include `vaultIndexerCache`.

**Issues:**

- [CRITICAL] **`discardFragment` does not update the index after discarding.** After `vault.fragments.discard(filePath)` succeeds, the fragment's row in `fragmentsTable` still has `pool = "unplaced"` (or whatever it was) and `filePath` pointing to the old source path. The next call to `indexer.fragments.findFilePath(uuid)` will return the old (now-deleted) path. Any subsequent `discardFragment` call for the same UUID would fail with `FILE_NOT_FOUND` from `readMarkdown`. The index is only updated on the next `rebuild()`. This is a known limitation of the current rebuild-only sync model, but it is not documented with a `// TODO:` on the method. The TODO comment on lines 86–90 mentions the watcher catch-up window for the _not-found_ case, but does not address the _stale-path_ case.

- [WARNING] **`getVaultIndexer` lazily creates and caches the indexer, but `getVaultDatabase` is called inside it.** If `getVaultDatabase` throws (e.g. migration failure), the indexer is never cached and the error is uncaught at the service boundary. `getVaultDatabase` itself has no error handling, relying on the caller to propagate. This is consistent with the rest of the service, but worth noting — there's an implicit assumption that database creation at this layer never fails.

- [WARNING] **`removeProject` evicts all three caches (vault, database, indexer), but the evicted `VaultDatabase` connection is not closed.** SQLite connections should be explicitly closed (`database.close()`) when the project is removed. Bun's SQLite driver will GC the handle eventually, but for long-running processes (the eventual API server) this is a connection leak. The `VaultDatabase` type needs a `close()` method, or `removeProject` needs access to it.

- [STYLE] `resolveProject` builds a `ProjectContext` by manually mapping fields from `record`:
  ```ts
  return {
    userUUID: record.userUUID,
    projectUUID: record.projectUUID,
    vaultPath: record.vaultPath,
  };
  ```
  If `ProjectContext` is a strict subset of `ProjectRecord`, use spread + destructure. If not, this manual mapping is intentional — but the intent should be clear. Check `ProjectRecord` vs `ProjectContext` shapes; if they are structurally equivalent, prefer `const { userUUID, projectUUID, vaultPath } = record; return { userUUID, projectUUID, vaultPath };` or just spread.

---

### `packages/storage/src/__tests__/storage-service.test.ts`

**Change:** New `StorageService.discardFragment` test suite added. Uses real indexer with `rebuild()` before discard.

**Issues:**

- [WARNING] Line 114:

  ```ts
  await expect(service.discardFragment(context, unknownUUID)).rejects.toMatchObject({
    code: "FRAGMENT_NOT_FOUND",
  });
  ```

  This is `await`ed and uses `toMatchObject` — structurally correct. However, `toMatchObject` on an `Error` instance matches against the object's enumerable properties. `VaultError.code` is a class field set via `this.code = code` in the constructor, which _is_ enumerable. This should work. No issue here — but worth noting that `toBeInstanceOf(VaultError)` in addition to the `toMatchObject` check would be more precise.

- [STYLE] `target.uuid` at line 97 — `target` is typed `IndexedFragment`, so `target.uuid` is correct. However `fragments[0]!` uses a non-null assertion without a guard. Since the prior assertion `expect(fragments.length).toBeGreaterThan(0)` has already run, this is safe in practice. But in Bun's test runner, a failing `expect` does not throw by default — it records a failure and continues. So `fragments[0]!` could still be `undefined` at runtime if the fixture has fewer fragments than expected. Prefer an explicit check or early return.

---

### `packages/storage/src/__tests__/vault.test.ts`

**Change:** `discard` test updated to pass a file path instead of a UUID.

**Issues:**

- [CRITICAL] **Line 91 — hollow test assertion (known anti-pattern):**

  ```ts
  expect(vault.fragments.discard(missingPath)).rejects.toThrow();
  ```

  This is not `await`ed. Per the project's known test anti-pattern (documented in agent memory), unawaited `.rejects` in Bun's test runner means the assertion never actually runs — the test passes unconditionally regardless of whether `discard` throws or resolves. This must be:

  ```ts
  await expect(vault.fragments.discard(missingPath)).rejects.toThrow();
  ```

- [STYLE] Lines 34–36: callback uses `f` as variable name:

  ```ts
  const discarded = fragments.filter((f) => f.pool === "discarded");
  ```

  Coding standard: no abbreviated names. `f` → `fragment`.

- [STYLE] Lines 102–103:

  ```ts
  const keys = aspects.map((a) => a.key);
  ```

  `a` → `aspect`.

- [STYLE] Lines 140–141:

  ```ts
  const bridgeNote = notes.find((n) => n.title === "bridge observation");
  ```

  `n` → `note`.

- [STYLE] Line 153:
  ```ts
  const refs = await vault.references.readAll();
  ```
  `refs` → `references`. Abbreviated name against standards.

---

## README Stale Documentation

**`packages/storage/README.md` line 40:**

```ts
await vault.fragments.discard(fragment.uuid);
```

The `discard` API changed from accepting a `FragmentUUID` to a `filePath: string`. This example is now wrong — it will cause a type error for anyone copying it. Must be updated to `await vault.fragments.discard("/path/to/vault/fragments/the-bridge.md")` with a note that callers should use `StorageService.discardFragment(context, uuid)` to avoid managing file paths directly.

---

## Architecture Notes

### The `discard` responsibility split

The refactor creates an implicit two-tier contract that is not documented anywhere:

- **Low-level** (`createVault`): operates on file paths. Caller must know the path.
- **High-level** (`createStorageService`): operates on UUIDs via the indexer.

This is a reasonable split, but it means `vault.fragments.discard(filePath)` is now effectively an internal method — calling it directly bypasses the UUID→path safety net. There is nothing stopping a consumer of `@maskor/storage` from importing `createVault` directly and calling `discard` with an arbitrary path. Consider whether `discard` should become package-private (unexported), or whether the README should explicitly warn against calling it directly.

### Index staleness after discard

After `discardFragment` succeeds, the vault index is stale: the fragment row still reflects the pre-discard state (old pool, old file path). The next `findFilePath(uuid)` call will return a path that no longer exists. This is an inherent consequence of the rebuild-only sync model — it is known and acceptable — but the lack of a `// TODO:` on `discardFragment` makes it non-obvious to a future reader.

When the chokidar watcher is introduced (see `suggestions.md`), this becomes a non-issue. Until then, callers of `discardFragment` should immediately call `indexer.rebuild()` or accept that the index is stale. This should be stated in the JSDoc or a TODO comment.

### Debt items 3, 4, 6 remain open

- **DB indexes**: `findByPool` issues a full table scan on `fragmentsTable` on every call. As fragments accumulate, this will degrade. The suggestion in `suggestions.md` is correct — add a composite index on `(pool, deleted_at)`.
- **`consumeAll` filename-as-title**: Still fragile. A file named `my-raw notes (draft 1).md` produces a title `my-raw notes (draft 1)` and a slug collision risk. This should at least use a descriptive fallback with a UUID suffix per the coding standard.
- **`recoverFromManifests`**: No progress. The vault is not truly self-healing yet.

---

## Verdict

The core intent — replacing the O(n) UUID scan in `discard` with an indexed lookup — is achieved correctly at the service layer. The implementation compiles, the test coverage exercises the new path end-to-end, and the architecture of pushing UUID resolution up to the service layer is sound.

However:

1. The hollow test on line 91 of `vault.test.ts` means one error path is untested.
2. The stale index after discard is an undocumented hazard.
3. The README documents the deleted API signature.
4. Four of six debt items are unaddressed (2, 3, 4, 6).
5. Several coding standard violations in the test files (abbreviated names).

The implementation is a net improvement, but should not be considered clean until the hollow test and README are fixed.
