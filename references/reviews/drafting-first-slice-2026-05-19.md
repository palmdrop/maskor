# Review: Drafting — first slice

**Date**: 2026-05-19
**Scope**: `packages/shared`, `packages/storage/src/drafts`, `packages/storage/src/watcher`, `packages/api/src/{commands,routes,errors,schemas}/drafts*`, `packages/frontend/src/pages/DraftsPage`
**Plan**: `references/plans/drafting-first-slice.md`
**Spec**: `specifications/drafting.md`

---

## Overall

The slice lands what the plan committed to: create / list / delete / restore, watcher drain, crash-recovery cleanup, action-log integration, `vault:restored` SSE, frontend page. Tests are dense and the snapshot pipeline is the right shape — staging → atomic rename → rollback on failure, mutex per vault, VACUUM INTO for the DB, action-log + project.json preserved across restore. Two real correctness gaps stand out: (1) the deferred storage write lock leaves API-originated writes unsynchronized with the snapshot pipeline — concurrent fragment writes can race the file copy and `VACUUM INTO` even though the watcher is paused, and (2) the restore rollback path leaves the live vault in a partial state if `cp` fails mid-copy. There are also two uncommitted, out-of-scope frontend files sitting on the branch (inline aspect creation) that did not belong to this slice.

---

## Bugs

### 1. API-originated writes are not synchronized with snapshot creation or restore

`packages/storage/src/service/storage-service.ts:1628-1700` — `drafts.create` and `drafts.restore` only `await watcher.pause()` (which drains chokidar-driven handlers) and hold the per-vault `withDraftMutex`. They do **not** block direct storage-service writes (`fragments.write`, `aspects.write`, `notes.write`, etc.). Those writes go straight through the drizzle wrapper and bypass both the watcher and the draft mutex.

```
T0: client A POSTs /drafts (acquires mutex, pauses watcher)
T1: client B POSTs /fragments  ← passes the resolveProject middleware, hits fragments.write
T2: createDraft copies fragments/ to staging  ← client B is writing fragments/*.md concurrently
T3: createDraft VACUUM INTO  ← captures DB state that may not match the markdown that was just copied
T4: client B finishes write
```

Result: the snapshot's markdown can be a torn read (some files pre-write, some post-write) and the DB can diverge from the snapshotted markdown. The spec is explicit about this — § Constraints: "Snapshot creation must drain in-flight write handlers, not just set a flag." § Creating step 2: "Acquire the storage write lock; drain in-flight write handlers." Plan Phase 4 dismisses the storage write lock with "the per-vault draft mutex + watcher drain already covers the spec's constraint," but that reasoning only covers watcher-originated writes. API-originated writes still race.

Restore is worse: between `restoreDraft` (which renames `.maskor/vault.db` aside, then copies the snapshot's `vault.db` into place) and `closeRawVaultDatabase`, the cached raw `bun:sqlite` handle still points at the moved-aside inode. Any concurrent API call that touches `vaultDatabase` writes to the now-detached file. The data goes nowhere.

Fix: introduce the storage write lock the spec asks for — a per-vault async lock that `fragments.write` / `aspects.write` / `notes.write` / `references.write` / `sequences.write` acquire shared, and `drafts.create` / `drafts.restore` acquire exclusive. Or, narrower scope: a single per-vault async mutex around all mutating storage-service entrypoints, gated by a flag that draft ops flip. The plan's "we don't need this yet" call should be reopened — the spec's invariant is not currently held.

### 2. Restore rollback can leave the live vault partially overwritten if `cp` fails mid-copy

`packages/storage/src/drafts/restore.ts:79-145` — `copiedIntoLive.push(target)` runs only **after** `await cp(...)` resolves. If `cp` throws partway through (out of space, EPERM, EIO), the live path contains a partial copy but the target is not added to `copiedIntoLive`. Rollback then:

1. Iterates `copiedIntoLive` and `rm`s those entries (this one is not in the list — skipped).
2. Iterates `movedAside` and does `rename(asidePath, livePath)`. The rename fails because `livePath` exists with the partial copy. The error is logged and swallowed.
3. Falls through to `rm(aside, ...)`, which deletes the aside copy.

Final state: `livePath` is the half-copied snapshot, the aside backup is gone. Live data lost.

```
movedAside: [fragments, aspects]
copiedIntoLive: [fragments]          ← aspects cp threw mid-copy, never pushed
live/aspects:   partial snapshot     ← rollback rename fails (exists), logged, ignored
aside/aspects:  deleted by final rm
```

Fix: in the rollback loop over `movedAside`, `rm(livePath, { recursive: true, force: true })` before the `rename`. Or push to `copiedIntoLive` immediately before `cp` (so rollback's first loop always cleans), accepting that a `cp` that didn't start gets a no-op `rm`.

### 3. Uncommitted, out-of-scope changes on the branch

`git status` shows two modified files that are unrelated to drafting:

- `packages/frontend/src/components/fragments/fragment-metadata-form.tsx`
- `packages/frontend/src/components/ui/tag-combobox.tsx`

The diff adds inline aspect creation from the fragment editor's tag combobox (`useCreateAspect` + `onCreate` prop). It's a fragment-editor change, not a drafting change. The plan is already marked Done and these changes have no plan/spec coverage. Either they belong on a separate branch or they were lost from a prior commit. They should not ride along with the drafting slice.

---

## Design

### 4. `DraftSchema` (OpenAPI) doesn't declare `directoryName`, but the list response includes it

`packages/api/src/routes/drafts.ts:130-139` returns `await storageService.drafts.list(projectContext)`, which is `ListedDraft[] = (DraftManifest & { directoryName: string })[]`. The route's response schema is `z.array(DraftSchema)` and `DraftSchema` (`packages/api/src/schemas/draft.ts:13-21`) does not include `directoryName`. Hono doesn't strip unknown fields, so the on-disk folder name leaks into every API response and the orval-generated client type. It's an implementation detail (the canonical id is `uuid`) that shouldn't be in the public payload. Either map to a `DraftSchema`-shaped object in the route or include `directoryName` in the schema if it's actually load-bearing.

### 5. Restore copies the snapshot's `vault.db` only to immediately rebuild from markdown

`packages/storage/src/drafts/constants.ts:31` includes `"vault.db"` in `RESTORE_MASKOR_ENTRIES`, so restore copies the snapshotted DB into the live location. The very next step (`packages/storage/src/service/storage-service.ts:1686`) is `await getVaultIndexer(context).rebuild()`, which truncates and refills the DB from the restored markdown — by design, since vault stays source of truth (`storage-sync.md`). The copied snapshot DB is overwritten before any caller reads from it.

This is needless I/O on every restore — drop `vault.db` from `RESTORE_MASKOR_ENTRIES` and have the rebuild path open / create the DB fresh. The snapshot still keeps its `vault.db` inside the draft directory (useful for the future per-draft preview feature, which the spec calls out), so nothing is lost.

### 6. Restore has no disk-space check

Spec § Creating a draft step 1 requires a disk check; restore (§ Restoring a draft) does not. If `saveCurrentFirst` is on, the pre-restore `createDraft` happens to disk-check first — incidental coverage. If the user unchecks the safety box, restore enters with no check and peak usage is roughly `2 × vault` (live moved aside + snapshot copied in). On a tight filesystem this can fail partway, triggering the rollback path (and see bug #2).

Either add a disk check to `drafts.restore` (mirroring `checkAvailableSpace`) or document why restore is exempt.

---

## Minor

### 7. Plan Phase 8 last task unchecked despite the commit landing

`references/plans/drafting-first-slice.md:108` shows `- [ ] git commit — sync drafting spec with first slice shipped.` but commit `0360829` ("docs: mark drafting-first-slice plan Done and update spec") did exactly that. Either tick the box or move it under Phase 8's done items.

### 8. Coding-standards drift: single-line `if` without braces

`references/CODING_STANDARDS.md` requires explicit braces. Several new files violate it:

- `packages/storage/src/drafts/create.ts:75` — `if (!existsSync(sourcePath)) return;`
- `packages/storage/src/drafts/list.ts:17` — `if (!existsSync(root)) return [];`
- `packages/storage/src/drafts/list.ts:23-24` — two unbraced `continue`s
- `packages/storage/src/drafts/restore.ts:71` — `if (existsSync(aside)) await rm(...)` (also: `await` inside an unbraced `if` is hard to read)
- `packages/storage/src/drafts/cleanup.ts:18,22` are fine (braced).

### 9. `restore-draft.ts` has a gnarly inline type

`packages/api/src/commands/drafts/restore-draft.ts:19`:

```ts
const logEntries: Awaited<ReturnType<Command<RestoreDraftInput, RestoreDraftResult>["execute"]>>["logEntries"] = [];
```

A `LogEntry[]` annotation (or pulling out a `type CommandResult = ...`) reads better and matches how other commands declare their return type.

### 10. `directorySize` skip uses a fragile path-suffix check

`packages/storage/src/drafts/disk-space.ts:18-24` skips `drafts/` only when `root.endsWith(MASKOR_DIRNAME)`. The intent (don't walk `.maskor/drafts/`) is right, but `endsWith(".maskor")` matches any path ending in `.maskor` at any depth — currently a non-issue because Maskor never nests `.maskor/`, but it's load-bearing for the disk-check accuracy and worth a comment, or a stricter check that anchors at `vaultPath/.maskor`.

### 11. `useVaultEvents` keeps a hard-coded copy of `VAULT_SYNC_EVENT_TYPES`

`packages/frontend/src/hooks/useVaultEvents.ts:5-16` duplicates the array from `@maskor/shared` and now needs to be kept in sync manually (the slice added `vault:restored` here too). The existing TODO acknowledges this — flagging for awareness, not asking for a fix in this slice.

---

## Non-issues

- **`vacuumVaultDatabaseInto` building the SQL via string interpolation.** `VACUUM INTO` doesn't accept bound parameters; the single-quote doubling in `paths.replace(/'/g, "''")` is the correct mitigation and the path is constructed internally (no user input).
- **`watcher.pause()` sets `isPaused = true` then awaits `inFlight.wait()`.** A handler that already passed the `isPaused` check before pause was called still increments the in-flight count immediately on entry, so `wait()` correctly waits for it to finish. The fence is good.
- **Subscriber bus moved from watcher to storage service.** Necessary so SSE clients survive the watcher teardown during restore. Confirmed in the service's `eventSubscribers` map and the events route which subscribes through `storageService.watcher.subscribe`.
- **`directorySize` skipping `.maskor/drafts/` from the pre-check.** Correct — including existing drafts would inflate `required` and pointlessly refuse creation.
- **Per-vault `withDraftMutex` rather than a queue.** Spec is explicit: concurrent attempts should return `DRAFT_OPERATION_IN_PROGRESS`, not queue.
- **`closeRawVaultDatabase` called after `restoreDraft` rather than before.** The bun:sqlite handle survives an `fs.rename` of its backing file on macOS/Linux; closing after the copy is fine *as long as nothing else writes to that handle* (see bug #1 for the actual concern).
- **Snapshot deliberately includes the DB even though restore rebuilds.** Kept on purpose for the future per-draft preview surface — see bug #5 for the unrelated waste in the *restore* path.
