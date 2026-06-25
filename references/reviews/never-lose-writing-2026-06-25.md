# Review: Never lose writing — save/swap defense-in-depth

**Date**: 2026-06-25
**Status**: Resolved
**Scope**: `packages/frontend/src/components/{prose-editor.tsx,prose-editor-tiptap-adapter.ts,entity-editor-shell.tsx,backup-failed-banner.tsx,fragments/fragment-editor.tsx}`, `packages/frontend/src/hooks/useEntityContentSwap.ts`, `packages/frontend/src/lib/commands/scopes/fragment-editor.ts`, `packages/storage/src/__tests__/*`
**Plan**: `references/plans/never-lose-writing.md`
**Spec**: `specifications/fragment-editor.md`, `specifications/storage-sync.md`, `specifications/fragment-split.md`

---

## Overall

The implementation matches the plan closely and the architecture is sound. The two load-bearing fixes — the `try/finally` load guards (Phase 1) and the independent dirty backstop (Phase 2) — correctly break the single-point-of-failure the incident exposed, and the backstop reuses the exact marker-free, whitespace-tolerant predicate the load effect already trusts, so it inherits the same false-fire safety. Swap-failure surfacing, page-hide flush, swap-survival regression tests, and save-before-split are all present and tested.

One real bug: the `backupFailed` banner is never cleared by a successful **canonical save**, so after a transient swap failure followed by a successful Save the user is left with a persistent, now-false "not being backed up" warning — exactly the trust erosion the plan worried about elsewhere. Everything else is minor.

---

## Bugs

### 1. `backupFailed` banner sticks after a successful save (stale false alarm)

`packages/frontend/src/hooks/useEntityContentSwap.ts:224` — `backupFailed` is only cleared by a subsequent **successful swap write** (`onSuccess` → `setBackupFailed(false)`). It is **not** cleared by `clear()`, which is what runs on a successful canonical Save (`entity-editor-shell.tsx:270` `saveContent` → `clearSwap`).

```
swap PUT fails        → backupFailed = true, banner shows
user hits Save (ok)   → onContentSave succeeds → clearSwap() deletes swap
                        server content updates, isDirty → false, liveContent resyncs
currentValue === serverValue → debounce returns early, no PUT, no onSuccess
                      → backupFailed stays true → banner persists until entity switch
```

The work is now safe on disk and the swap is deleted, but the banner still says "Unsaved changes are not being backed up. Copy your work somewhere safe." A persistent false warning after the danger has passed undermines the feature's credibility (the same concern the plan cites for dropping the 2xx-but-stale check). The same path applies to the linked-pair banner in `fragment-editor.tsx:392` via `fragmentBackupFailed` / `marginSwap.backupFailed`.

Fix: reset `setBackupFailed(false)` inside `clear()` (a successful save / discard means there is no pending unsaved content to back up).

---

## Design

None.

---

## Minor

### 2. Page-hide flush uses the normal fetch path, which can be cancelled on real unload

`packages/frontend/src/hooks/useEntityContentSwap.ts:200` — the flush calls `writeSwapRef.current(value)`, i.e. the same React Query `PUT`. On `visibilitychange → hidden` this usually completes (it fires before teardown, as the comment notes), but on a genuine `pagehide`/tab-close the in-flight `fetch` is frequently aborted by the browser. `navigator.sendBeacon` or `fetch(..., { keepalive: true })` survives unload and would make the flush meaningfully more reliable. The plan scopes this as best-effort, so this is a note, not a blocker — worth a `// TODO:` if not addressed.

### 3. Split `save` context comment overstates what it persists

`packages/frontend/src/lib/commands/scopes/fragment-editor.ts:15` and `fragment-editor.tsx:281` both say the save persists "the open fragment (and its Margin)", but `shellRef.current?.save()` → `saveContent` only persists the fragment body via `onContentSave`; the Margin editor saves separately. Split reads only the fragment body from the vault, so correctness is fine — but the "(and its Margin)" parenthetical is inaccurate and should be dropped to avoid implying a guarantee that isn't there.

### 4. No test for the `backupFailed` clear-on-save path

`packages/frontend/src/hooks/useEntityContentSwap.test.ts` — the clearing test only covers a later successful **swap write**. The save/`clear()` path (bug #1) is untested, which is why the stale-banner case slipped through. Add a test once #1 is fixed: failure raises `backupFailed`, then `clear()` resets it.

---

## Non-issues

- **Backstop reuses the load effect's equivalence check continuously** — running `isTrailingWhitespaceEquivalent(cleanContent, readCleanBuffer())` every 1.5s could in theory false-fire if markdown round-tripping were unstable, but it is the identical predicate the load effect (`prose-editor.tsx:401`) already depends on for buffer authority, including the `unescapeDocumentLinks` normalization. If it were unstable, existing refetch behavior would already be broken. Safe.
- **Removed `warnedRef` dedupe; `console.warn` now fires per failed write** — intentional and harmless; `setBackupFailed(true)` is idempotent (no re-render when already true), and per-failure logging is better for diagnosis.
- **Debounce effect deps narrowed to `[currentValue, serverValue, debounceMs]`** — correct; `projectId`/`entityType`/`entityUUID` are now reached only through the stable `writeSwapRef`, so they don't belong in the deps.
- **`setContent` swallows + `console.error` instead of rethrowing** — deliberate (runs in effects; a propagating throw risks unmounting the editor) and the `finally` still clears the guard, which is the load-bearing part.
- **Heartbeat timer resets whenever `cleanContent`/`isDirty` change** — means it effectively ticks during idle/stable periods, which is exactly when a stuck-clean buffer needs catching; fine for a backstop.

---

## Resolution

1. **Fixed.** `clear()` now calls `setBackupFailed(false)` (`useEntityContentSwap.ts:238`) — a successful save / discard lowers the banner. Covered by a new test: a failing PUT raises `backupFailed`, then `clear()` resets it.
2. **Mitigated.** Added a `// TODO:` on the page-hide flush (`useEntityContentSwap.ts:202`) to route the flush write through `fetch(..., { keepalive: true })` / `sendBeacon` so it survives a hard unload. Left as best-effort per the plan's scope.
3. **Fixed.** Dropped the inaccurate "(and its Margin)" from the split `save` context comment (`fragment-editor.ts:15`); it persists the fragment body only.
4. **Fixed.** Added the clear-on-save test in `useEntityContentSwap.test.ts`.

`bun run verify` green (119 files, 912 tests).
