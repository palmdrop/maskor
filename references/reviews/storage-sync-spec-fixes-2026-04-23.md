# Review: Storage Sync Spec Fixes

**Date**: 23-04-2026
**Branch**: main
**Plan**: `references/plans/storage-sync-spec-fixes.md`
**Spec**: `specifications/storage-sync.md`

All seven plan items landed with the correct structural intent. The implementation is solid overall — the mutex, per-file consume, `updatedAt` plumbing, and `aspect_uuid` removal are all done correctly. There are two critical issues, four warnings, and one style note.

---

## Critical

### 1. Rebuild fires after watcher start — mutex is useless on first request

**File**: `packages/api/src/middleware/resolve-project.ts`

`storageService.watcher.start(projectContext)` is called before `storageService.index.rebuild(projectContext)`, and rebuild is fire-and-forget. The watcher is already running when rebuild begins. `watcher.pause()` inside `index.rebuild()` fires _after_ the watcher started — there is a window between `start()` and `pause()` where events are not gated and can be upserted before the rebuild transaction commits over them.

The spec startup sequence (spec lines 67–70) is explicit: rebuild first, then start watcher. The comment in `resolve-project.ts` ("The watcher catches any changes that arrive while the rebuild is in progress") actively contradicts the spec and misunderstands the mutex.

**Fix**: call `rebuild` to completion before `start`:

```ts
if (!rebuiltProjects.has(projectContext.projectUUID)) {
  rebuiltProjects.add(projectContext.projectUUID);
  await storageService.index.rebuild(projectContext); // complete first
}
storageService.watcher.start(projectContext); // then start watching
```

Plan item 6 ("verify server-side rebuild guard") was not verified — it was implemented incorrectly.

---

### 2. `syncAspect` does not update `rawContent` after UUID write-back

**File**: `packages/storage/src/watcher/watcher.ts` (~line 201)

When an aspect lacks a UUID, the file is rewritten with a new UUID but `rawContent` is not reassigned to the rewritten content. `syncNote` (line ~238) and `syncReference` (line ~277) both do `rawContent = rewritten` after write-back; `syncAspect` is the only outlier.

Aspects have no `contentHash` column, so there is no hash-guard bug. However the second watcher event from the UUID write-back fires a full spurious upsert instead of silently no-op-ing. Pre-existing bug, but now the only remaining entity type with it.

**Fix**: add `rawContent = rewritten;` after `Bun.write(absolutePath, rewritten)` in `syncAspect`.

---

## Warnings

### 3. `syncPieces` discards `SyncWarning[]` from `upsertFragment`

**File**: `packages/storage/src/watcher/watcher.ts` (~line 327)

`upsertFragment(tx, fragment!, entityRelativePath, rawContent, knownAspectKeys)` — the return value is silently dropped. A consumed piece with an unknown aspect key produces no log output; the drift is invisible. Every other call site (`syncFragment`, `indexer.ts`) logs the warnings.

**Fix**: capture and log warnings the same way `syncFragment` does.

---

### 4. Rebuild mutex has an async race window

**Files**: `packages/storage/src/watcher/watcher.ts`, `packages/storage/src/service/storage-service.ts`

`isPaused = true` is set synchronously in `watcher.pause()`. However any event handler already past the `if (isPaused) return` check and mid-execution (e.g. awaiting `Bun.file(...).text()` in `syncFragment`) when `pause()` is called will complete and upsert into the DB. Rebuild's single transaction will overwrite that upsert when it commits — the exact race the mutex was designed to prevent.

The gap is narrow in practice (chokidar's `awaitWriteFinish` delays make rapid-fire events unlikely) but is a real correctness hole. A full fix requires draining in-flight handlers before proceeding with rebuild.

**Immediate fix**: add a `TODO` comment on `pause()` noting the in-flight race and linking to this review. Also add a note to `references/suggestions.md`

---

### 5. `updatedAt` open question resolved silently in code but open in spec

**Files**: `packages/storage/src/vault/markdown/mappers/fragment.ts` (line 22), `specifications/storage-sync.md` (line 146)

`fromFile` falls back to `new Date()` (sync time) when `updatedAt` is missing from frontmatter. This is a de-facto resolution to the open question in the spec. Two consequences:

- For legacy files / Obsidian-only edits, `updatedAt` in the DB reflects the sync time, not a user action time — potentially misleading to consumers.
- Files without `updatedAt` frontmatter never have it written back, so every watcher cycle will regenerate a new in-memory value (though hash-guard prevents re-upsert after the first).

**Fix**: close the open question in `specifications/storage-sync.md` with the chosen behaviour (sync time fallback).

---

## Style

### 6. `fragment!` non-null assertion in `syncPieces`

**File**: `packages/storage/src/watcher/watcher.ts` (~line 327)

The guard is unnecessary since a null check has already been performed.

---

## Summary Table

| #   | Severity | File                                 | Issue                                                            |
| --- | -------- | ------------------------------------ | ---------------------------------------------------------------- |
| 1   | Critical | `api/middleware/resolve-project.ts`  | Watcher starts before rebuild; mutex broken on first request     |
| 2   | Critical | `storage/watcher/watcher.ts`         | `syncAspect` doesn't reassign `rawContent` after UUID write-back |
| 3   | Warning  | `storage/watcher/watcher.ts`         | `syncPieces` discards `SyncWarning[]` return value               |
| 4   | Warning  | `storage/service/storage-service.ts` | `discard()`/`restore()` don't stamp new `updatedAt`              |
| 5   | Warning  | `storage/watcher/watcher.ts`         | Async race window in rebuild mutex                               |
| 6   | Warning  | `storage/mappers/fragment.ts` + spec | `updatedAt` fallback resolves open question silently             |
| 7   | Style    | `storage/watcher/watcher.ts`         | `fragment!` non-null assertion avoidable                         |
