# Vault Watcher

**Date**: 10-04-2026
**Status**: Done
**Implemented At**: 10-04-2026

---

## Goal

Complement the full `rebuild()` polling model with a live chokidar watcher that:

- Syncs individual files on `add` / `change` / `unlink` events
- Keeps the DB up-to-date immediately after API writes (no stale-index window)
- Is idempotent — safe to fire for both external and API-originated writes

---

## 1. Extract shared upsert helpers

`rebuild()` currently owns all per-entity upsert logic. Extract it into a new file:

**`src/indexer/upserts.ts`**

```ts
upsertFragment(tx, fragment, filePath, aspectKeyToUuid): SyncWarning[]
upsertAspect(tx, aspect, filePath): void
upsertNote(tx, note, filePath): void
upsertReference(tx, reference, filePath): void
softDeleteByFilePath(tx, filePath): void   // used on unlink
```

Each function:

- Accepts a Drizzle transaction (or raw DB) so the caller controls transaction scope
- Matches the existing upsert pattern: `INSERT ... ON CONFLICT DO UPDATE ... SET deletedAt: null`
- Returns any `SyncWarning[]` (only fragments can produce `UNKNOWN_ASPECT_KEY`)
- All helper signatures stay **synchronous** — `bun:sqlite` is sync and `rebuild()` wraps helpers in a sync transaction callback. Do not leak `async` into helpers.

`rebuild()` is refactored to call these helpers — no behavioral change, just delegating. Rebuild is kept to make an initial sync when the service starts up.

---

## 2. Hash guard

Before any watcher-triggered upsert, compute and compare content hash:

```ts
const incoming = hashContent(fileContent); // hash full file, not just body
const stored = db.select({ contentHash }).from(fragmentsTable).where(eq(uuid, ...)).get();
if (stored?.contentHash === incoming) return; // no-op
```

> **Note:** Hash must cover the **full file content** (frontmatter + body), not just the parsed body. UUID write-back changes frontmatter only — hashing only the body would incorrectly skip the second watcher event rather than re-upsert cleanly. The second event after a UUID write-back is an expected (harmless) re-upsert, not a no-op.

This makes watcher events idempotent for API-originated writes — the DB already has the correct hash so the watcher skips silently.

---

## 3. Path handling

Chokidar emits **absolute paths**. The DB stores paths **relative to vault root**. All watcher code must strip `vaultRoot` before any DB lookup or entity routing:

```ts
const relativePath = path.relative(vaultRoot, absolutePath);
```

This applies to:

- Entity routing (prefix matching against `fragments/`, `aspects/`, etc.)
- All `softDeleteByFilePath` calls
- All upsert helper calls

---

## 4. VaultWatcher

**`src/watcher/watcher.ts`** — new file, exports `createVaultWatcher`.

### Entity routing

Determine entity type from **relative** path prefix:

```
fragments/           → syncFragment
fragments/discarded/ → syncFragment (pool override handled by file content)
aspects/             → syncAspect
notes/               → syncNote
references/          → syncReference
pieces/              → syncPiece (see below)
.maskor/             → ignored
.obsidian/           → ignored
```

Non-`.md` files: ignored.

#### `pieces/` routing

`vault.pieces.consumeAll()` processes all pieces in batch and is not a valid single-file handler. Instead, `syncPiece(filePath)` should:

1. Read and parse the single piece file
2. Process it (import/consume)
3. Delete the file

Define a `vault.pieces.consume(filePath)` method, or route `pieces/` add events to `consumeAll()` and accept that all current pieces are consumed at once (document the trade-off explicitly).

### Per-file debounce vs. `awaitWriteFinish`

Use `awaitWriteFinish` in the chokidar config (see below) as the sole guard against partial writes. **Do not add a separate manual debounce map** — they solve the same problem and stacking them adds up to 400ms latency per event with no additional safety benefit.

### Event handlers

```
add / change  → hashGuard → readFile → parse → upsertEntity
unlink        → softDeleteByFilePath
```

On `add` with no UUID in frontmatter: write UUID back via `vault.*.write()`, then upsert.
The write-back triggers a second watcher event which will hash-guard to a no-op (full-file hash matches).

On `add` with a **colliding UUID** (user manually duplicated a file): assign a new UUID, write back, then upsert. This mirrors the behavior specified in `SYNC_CONTRACT.md`.

#### Error handling

Each event handler must wrap its logic in try/catch. On failure:

- Log the error with the file path. Use the existing logger functionality from `/packages/shared/src/logger`.
- Skip the event (do not retry automatically)
- Emit a `SyncWarning` if a warning surface is available

Errors to expect: file deleted between event and read (`ENOENT`), malformed frontmatter, DB locked during rebuild.

### Aspect key resolution on fragment sync

Load `aspectKeyToUuid` from DB at sync time (single SELECT on `aspectsTable`) — not from disk.

**Ordering hazard:** If an aspect and a fragment change in the same `awaitWriteFinish` window, the aspect event must be processed before the fragment event to ensure the aspect key resolves correctly. Process `aspects/` events before `fragments/` events when both are pending. (In practice chokidar fires events serially; this is a documentation note, not a code change.)

### Chokidar config

```ts
chokidar.watch(vaultRoot, {
  ignored: /(^|[\/\\])\..+/, // dot files/dirs (covers .maskor/, .obsidian/)
  persistent: true,
  ignoreInitial: true, // startup handled by rebuild()
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 50,
  },
});
```

`awaitWriteFinish` guards against partial writes from editors that flush in multiple chunks. No additional debounce needed.

### Lifecycle

```ts
type VaultWatcher = {
  start(): void; // idempotent — calling start() twice is a no-op
  stop(): Promise<void>; // safe to call before start(); resolves immediately
};
```

`createVaultWatcher(vaultDatabase, vault, logger?)` — same factory pattern as `createVaultIndexer`. **Do not accept `vaultRoot` as a separate parameter** — derive it from `vault.config.root` to avoid the two values diverging.

---

## 5. StorageService changes

### Watcher cache

```ts
const vaultWatcherCache = new Map<ProjectUUID, VaultWatcher>();
```

Same lazy-init pattern as `vaultIndexerCache`.

### Teardown

`removeProject()` must stop and evict the watcher from `vaultWatcherCache` alongside the existing cache evictions. A stale watcher on a removed project will keep its file handles open and continue firing events against a now-deleted DB.

### Write path: update DB inline

After every vault write call in `StorageService`, call the matching upsert helper directly. Do not wait for the watcher.

Affected methods and what each must supply to the upsert helper:

| Method              | Required for upsert                                                                 |
| ------------------- | ----------------------------------------------------------------------------------- |
| `fragments.write`   | `filePath` (returned or derived from slug), `aspectKeyToUuid` (DB read)             |
| `fragments.discard` | Two-step: soft-delete old `filePath`, then upsert at new `discarded/<slug>.md` path |
| `aspects.write`     | `filePath` derived from slug                                                        |
| `notes.write`       | `filePath` derived from slug                                                        |
| `references.write`  | `filePath` derived from slug                                                        |

> **`fragments.discard` is not a simple write.** It calls `rename()` then rewrites at a new path. The inline DB update must soft-delete the old path first, then upsert at the destination path. `vault.fragments.write()` currently returns `void` and does not expose the computed `filePath` — the `write()` method (or a new overload) must return `filePath`, or `StorageService` must derive it using the same slug logic.

This closes the stale-index window for API-originated writes. The watcher fires afterward and hash-guards to a no-op.

### Rebuild / watcher race

`rebuild()` reads all vault files into memory first, then writes in a single transaction. A watcher event that fires mid-rebuild and upserts a change will be overwritten by `rebuild()`'s stale in-memory snapshot when the transaction commits.

Mitigation: pause the watcher during `rebuild()`, or acquire a simple mutex that both `rebuild()` and watcher event handlers respect. The plan's edge case table previously marked this as safe — it is not.

### New surface

```ts
service.watcher.start(context): void
service.watcher.stop(context): Promise<void>
```

### Startup sequence (in `@maskor/api`)

```ts
const context = await service.resolveProject(projectUUID);
await service.index.rebuild(context); // establish clean baseline
service.watcher.start(context); // watch going forward
```

---

## 6. Edge cases

| Case                                        | Handling                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rename                                      | `unlink` soft-deletes old path, `add` upserts with same UUID → un-soft-deletes via `deletedAt: null`. Chokidar does not guarantee `unlink` before `add` — `ON CONFLICT DO UPDATE` on UUID collapses any brief duplicate. |
| `pieces/` add                               | Route to per-file consume logic (see Section 4)                                                                                                                                                                          |
| Watcher UUID write-back                     | Write triggers second event → full-file hash matches → no-op                                                                                                                                                             |
| UUID collision on `add`                     | Assign new UUID, write back, then upsert (per SYNC_CONTRACT.md)                                                                                                                                                          |
| Watcher fires during `rebuild()`            | **Not safe as-is.** Pause watcher or use a mutex during rebuild (see Section 5).                                                                                                                                         |
| Aspect deleted while fragments reference it | `softDeleteByFilePath` on aspect; fragment properties retain stale `aspectKey` with `aspectUuid: null` (existing behavior)                                                                                               |
| `readFile` throws `ENOENT`                  | File was deleted between event and read — log and skip                                                                                                                                                                   |
| Parse error                                 | Log warning with file path, skip event                                                                                                                                                                                   |
| DB locked                                   | Log error, skip event (watcher does not retry)                                                                                                                                                                           |

---

## 7. File layout

```
src/
  indexer/
    indexer.ts        ← refactored to delegate to upserts.ts
    upserts.ts        ← new: shared upsert helpers
    assemblers.ts     ← unchanged
    types.ts          ← unchanged
  watcher/
    watcher.ts        ← new: createVaultWatcher
    index.ts          ← new: re-export
  service/
    storage-service.ts ← add watcher cache + inline DB updates on write + teardown
```

---

## 8. Dependencies

```bash
bun add chokidar --cwd packages/storage
```

> `@types/chokidar` does **not** exist for chokidar v3+ — it ships its own types. Do not install it.

---

## 9. Out of scope

- Sequences/sections sync (no vault representation yet)
- Multi-vault watcher coordination
- Watcher events emitted to API clients (WebSocket / SSE) — follow-up
- Automatic retry on failed watcher events
