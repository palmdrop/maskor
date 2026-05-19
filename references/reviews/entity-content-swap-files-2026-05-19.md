# Review: Entity content swap files

**Date**: 2026-05-19
**Scope**: `packages/storage/src/swap/`, `packages/api/src/routes/swap.ts`, `packages/frontend/src/hooks/useEntityContentSwap.ts`, `packages/frontend/src/components/entity-editor-shell.tsx`, `packages/frontend/src/components/unsaved-recovery-banner.tsx`
**Plan**: `references/plans/entity-content-swap-files.md`
**Spec**: `specifications/fragment-editor.md`

---

## Overall

The shipped feature matches the plan's stated tasks one-to-one. The storage module is well-isolated, tests are thorough (storage, API integration, watcher-exclusion, hook unit, shell integration, banner), and `packages/storage/CLAUDE.md` plus the spec's shipped entry were both updated. One open issue: the React Query cache is configured in a way that breaks the plan's explicit "navigates away before saving" recovery case for intra-SPA navigation. (A second concern about the routes bypassing the commands pipeline was discussed and resolved by adding a sanctioned exception to `packages/api/CLAUDE.md`.)

---

## Bugs

### 1. Intra-SPA navigate-away-and-back loses the swap recovery banner

`packages/frontend/src/hooks/useEntityContentSwap.ts:41-47` — `useGetSwap` is configured with `staleTime: Infinity` and no `refetchOnMount` override. React Query treats the cached response as fresh forever, so within the default 5-minute `gcTime`, remounting `useGetSwap` for the same `(projectId, entityType, entityUUID)` triple returns the cached data without refetching.

Sequence that fails:

```
visit A → GET swap → {content: null, savedAt: null} cached
type in A → debounced PUT writes swap to disk
navigate to B (FragmentEditor unmounts; QueryClient retains cache)
navigate back to A within 5 min → useGetSwap returns the cached null/null
→ hook sets hasSeeded=true with no recovery → banner does not appear
```

The plan's goal states: "If Maskor crashes, the browser closes, the tab refreshes, **or the user navigates away** before saving, the next time that entity opens its cached content pre-loads into the editor and a recovery banner offers 'Restore from server.'" Intra-SPA navigation falls inside that contract, and the manual verification checklist for Phase 6 only covers refresh and tab close — those wipe the QueryClient and accidentally mask this. The PUT path also does not invalidate or write through to the GET cache, so even a navigate-back inside the same React tree won't see the updated swap.

Fix: drop `staleTime: Infinity` (the project default `staleTime: 0` already does what we want here, and the data is tiny — a per-mount refetch on a local API is cheap), or set `refetchOnMount: "always"`. Alternatively, set the GET cache from the PUT response on success, but that's more code for the same outcome.

---

## Design

None.

---

## Minor

### 3. `throwStorageError` doesn't map `SwapEntityTypeError`

`packages/api/src/errors.ts:19-114` — the storage layer defines `SwapEntityTypeError` (`packages/storage/src/swap/types.ts:27-36`) with code `SWAP_UNKNOWN_ENTITY_TYPE`. The API error mapper has no branch for it, so if it ever bubbles up it becomes a 500. In practice the `z.enum(SWAP_ENTITY_TYPES)` param schema rejects unknown types at the Zod boundary before the storage layer sees them — the unit test asserting 400 is hitting that, not the storage error. So the storage-layer assertion is unreachable from the API. Either drop the duplicate guard or add a 400 mapping for symmetry with the other storage errors.

### 4. `staleTime: Infinity` + `retry: false` makes a one-off GET failure permanent for the session

`packages/frontend/src/hooks/useEntityContentSwap.ts:41-47` — combined with the cache behavior above, a single failed initial GET (network blip, API restart mid-load) sets `hasSeeded=true` (via the error branch at `:81-85`) and the query never refetches. Recovery is silently disabled for that entity for the rest of the session. Very rare against a local API, but worth at least one retry given the cost of a missed recovery is "user thinks they lost their writing."

### 5. Misleading "server" wording in `useEntityContentSwap`

`packages/frontend/src/hooks/useEntityContentSwap.ts:99-101` — comment reads "the server already has this exact string." In this hook "server" means the swap file on disk, not the canonical entity store, which is itself the contrast the plan keeps drawing. Reword to "the swap file already holds this exact string" or similar.

### 6. Recovery effect re-runs on every parent render

`packages/frontend/src/components/entity-editor-shell.tsx:103-110` — depends on `onProseChange`, which is recreated each render by every consumer (`onProseChange={() => setIsProseDirty(true)}` in `FragmentEditor`, `AspectEditor`, etc.). `recoveryAppliedRef` makes each re-run a no-op, but the effect fires on every render of the shell. Stabilize with `useCallback` at the call sites, or stash `onProseChange` in a ref and drop it from the dep array.

### 7. `.corrupt` files accumulate with no cleanup

`packages/storage/src/swap/storage.ts:55-77` — the quarantine path is correct, but nothing ever sweeps `.maskor/swap/<entityType>/*.json.corrupt`. Low priority, but worth a `// TODO` so a future reader doesn't wonder if a periodic cleanup was intended.

---

## Non-issues

- **`useGetSwap` returns 200 with null fields instead of 404 on miss** — deliberate change (commit `9e5de28`), reflected in the schema (`packages/api/src/schemas/swap.ts:29-34`) and matches the plan's network-panel-cleanliness rationale.
- **Swap operations skip `withVaultWriteLock`** — intentional and documented in the updated `packages/storage/CLAUDE.md`. Same exclusion class as `actionLog.append`.
- **Storage layer accepts arbitrary entityUUID strings while the API rejects non-UUIDs** — fine. Validation lives at the API boundary; storage tests use placeholder strings.
- **Watcher exclusion test asserts zero events of any type** — strong but correct: nothing under `.maskor/` should trigger any sync event.
- **Tight 150ms debounce with no `beforeunload` flush** — the plan explicitly accepts this loss window.
- **Metadata fields don't write swap files** — by design; metadata-loss-on-crash is accepted (carried over to the now-trimmed `references/suggestions.md`).
