# Review: Resilient rebuild, invalid-file warnings, and manual DB reset

**Date**: 2026-06-01
**Scope**: `packages/storage`, `packages/api`, `packages/frontend`, `packages/shared`
**Plan**: `references/plans/resilient-rebuild-and-db-reset.md`
**Spec**: `specifications/storage-sync.md`, `specifications/project-config.md`

---

## Overall

Faithful to the plan and well-tested. `bun run verify` passes (811 backend + 462 frontend tests, typecheck, OpenAPI snapshot in sync). The fault-tolerant read is funnelled through one helper, the watcher/rebuild warning keys line up, the reset teardown mirrors `drafts.restore` correctly, and the gray-matter cache fix is a genuine catch. No bugs that break behavior. The findings below are a swallowed error message (worth fixing — the user can't see _why_ a reset failed) and a few cosmetic notes.

---

## Bugs

None.

---

## Design

None.

---

## Minor

### 1. `onError` discards the actual failure reason — FIXED

`packages/frontend/src/pages/ProjectConfigPage/tabs/GeneralTab.tsx:40,67` — both handlers rendered a fixed `"… failed — see server logs."` and threw away the `error` argument. The whole point of this phase was to kill the silent fire-and-forget, but the user still couldn't see _what_ went wrong without server access. **Fixed:** an `errorMessage(error)` helper pulls the server-provided message off the thrown `ApiRequestError` (`error.message`), so the status line now reads `Rebuild failed: <reason>` / `Reset failed: <reason>`. Covered by two new GeneralTab tests.

### 2. Status line never auto-clears — FIXED

`GeneralTab.tsx` — `indexStatus` persisted until the next button press. **Fixed:** a `useEffect` auto-dismisses a _success_ message after 4s; error messages stay put (the user needs to read them).

### 3. Reset failure leaves the watcher stopped — FIXED

`packages/storage/src/service/storage-service.ts` — if `getVaultIndexer(context).rebuild()` threw after the DB files were deleted, `getVaultWatcher(context).start()` was never reached and the cache was already cleared, so live sync stayed dead until the next `resolveProject`/restart. **Fixed:** the rebuild is wrapped in a `try/catch` that restarts the watcher on the freshly migrated (empty) DB before rethrowing. The identical exposure in `drafts.restore` is left as-is (out of scope for this change) — worth a follow-up.

---

## Non-issues

- **Native `confirm()` instead of a dialog component** (`GeneralTab.tsx`) — plan-accepted ("behind a `confirm()`"). Inconsistent with the app's other modals but intentional.
- **`INVALID_ENTITY_FILE` and `WRONG_FORMAT_FILE` can share a `dedupKey` (file path)** — the unique index is `(kind, dedupKey)`, so different kinds coexist; no collision.
- **`deleteStateWarningByKey` runs on every successful add/change event** (`watcher.ts`) — a no-op DB delete returning 0 rows in the common case; mirrors the existing `WRONG_FORMAT_FILE` upkeep.
- **`reset` calls the indexer's `rebuild()` while holding the write lock** — the indexer rebuild does not itself acquire the lock (per `packages/storage/CLAUDE.md`), so no deadlock; matches `drafts.restore`.
- **Commands with empty `logEntries`** (`rebuildIndexCommand`, `resetDatabaseCommand`) — `executeCommand` loops zero entries, so no action-log write; re-derivation is correctly not a content mutation.
- **`entityKind: "sequence"` in the warning schema has no watcher route** — sequences aren't watched, but rebuild still captures malformed-sequence failures and re-detects them, so the member is used.
