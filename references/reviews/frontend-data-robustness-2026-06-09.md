# Review: Frontend data robustness (loader prefetch, Suspense, error boundaries)

**Date**: 2026-06-09
**Scope**: `packages/frontend` (`src/components/data/`, `src/router.ts`, `src/queryClient.ts`, view migrations)
**Plan**: `references/plans/frontend-data-robustness.md`
**Spec**: `specifications/navigation.md`

---

## Overall

Strong implementation that matches the plan's intent. The infrastructure layer (`ViewError`, `ViewPending`, `RouteErrorComponent`, `AppErrorBoundary`, the `queryClient` policy) is clean, well-commented, and well-tested; the view migrations consistently follow the loader-prefetch + `useSuspenseQuery` path and correctly drop the now-redundant `?.`/`isLoading`/`isError` defensiveness. Typecheck is green and the new tests pass (16/16). No correctness bugs found. The one finding worth a decision is a **dropped "Rebuilding project index…" affordance** — a real UX regression that is a side effect of the migration and isn't called out in the plan. Everything else is minor.

---

## Bugs

None.

---

## Design

### 1. Rebuild-status affordance silently dropped across three views

`OverviewPage/index.tsx`, `FragmentListPage.tsx`, `ProjectConfigPage/index.tsx` — all three previously rendered a dedicated **"Rebuilding project index…"** message when `isLoading && isRebuilding`. The migration removed `useRebuildStatus`/`isRebuilding` from each, so during a server-side index rebuild the user now sees either the layout-stable blank `ViewPending` shell or — if a request errors while the index is mid-rebuild — the generic `ViewError` "Couldn't load this view." with a Retry button, which is misleading for a transient, self-resolving state.

Consequences:

- Loss of the explanatory affordance the rebuild state used to provide.
- `useRebuildStatus` (`contexts/RebuildStatusContext.tsx:11`) now has **zero consumers**. The `RebuildStatusProvider` is still needed (its effect invalidates queries on the rebuilding→idle transition, `RebuildStatusContext.tsx:35-45`), but the hook export is dead.

This is outside the plan's stated scope, so it reads as an unintended side effect rather than a deliberate removal. Decide explicitly: either (a) re-surface rebuild state in the new pending/error path (e.g. `ViewPending`/`ViewError` consulting `useRebuildStatus` to show rebuild-specific copy), or (b) confirm the affordance is intentionally gone and delete the now-dead `useRebuildStatus` hook.

**[RESOLVED 2026-06-10]** Developer chose (b): the affordance is intentionally gone. Removed the dead `useRebuildStatus` hook, the `RebuildStatusContext`, and the `isRebuilding` context value; renamed `contexts/RebuildStatusContext.tsx` → `contexts/RebuildStatusProvider.tsx`. The provider stays as a pure side-effect wrapper (polls rebuild status, invalidates project queries on completion).

---

## Minor

### 2. `references/TODO.md` flips two completed items back to unchecked

`references/TODO.md:49,66` — this diff changes `- [x] in-line editing of fragments in preview mode` and `- [x] notification/banner component for communicating result of actions` back to `- [ ]`. Neither relates to the data-robustness plan. Looks like an accidental edit (or an unexplained reopen). Confirm intent; revert if unintended.

**[RESOLVED 2026-06-10]** Reverted both items back to `- [x]`.

### 3. Overview's dependent sequence-contents query has no inline handling for a 4xx

`OverviewPage/index.tsx` — `useGetSequenceContents` stays a classic `useQuery` (correct: it's dependent on the resolved sequence). A 5xx with no data routes to the boundary as designed. But a **4xx** is held inline by the `throwOnError` policy, and there is no inline branch for it: `spineContentReady = !sequence || !!contentsEnvelope` stays `false` forever (a sequence exists, `contentsEnvelope` never arrives), so scroll restoration never runs and the prose spine renders empty with no error shown. A 4xx on an already-validated sequence uuid is unlikely, but it's a silent dead-state rather than a surfaced failure. Low priority; note it or add a thrown/inline fallback for the contents query.

**[RESOLVED 2026-06-10]** Added a per-query `throwOnError: (_error, query) => query.state.data === undefined` to the contents `useQuery`, so any no-data failure (4xx included) routes to the route boundary instead of stranding the spine. A background refetch that fails with data present still keeps its data (handled by the global toast).

### 4. `RouteErrorComponent` resets query errors app-wide on mount

`components/data/RouteErrorComponent.tsx:18-20` — the mount `useEffect` calls `queryErrorResetBoundary.reset()`, which clears/marks-for-refetch **all** errored queries, not just the failed view's. Generally the desired self-heal behavior, but worth being aware of: mounting any route error component can trigger refetches of unrelated errored queries elsewhere. No action needed unless that becomes observable.

---

## Non-issues

- **Editors' `if (!entity) return null`** (`NoteEditor`, `ReferenceEditor`, `AspectEditor`, `ProjectConfigPage`) — `customFetch` throws `ApiRequestError` on any non-2xx (`api/fetch.ts:5-12`), and `useSuspenseQuery` always throws to the boundary, so the GET envelope is effectively always `status === 200`; the `!entity` branch is an unreachable narrowing guard, not a silent-blank path.
- **`Promise.allSettled` in loaders** — intentional. A rejecting query must not fail the navigation; the failure is re-surfaced in-render by `useSuspenseQuery` and caught by the route boundary, keeping the navbar mounted.
- **`keepPreviousData` on the assembled-preview query** (`PreviewPage.tsx`) — intentional; holds prior content during a toggle/sequence-switch refetch instead of flashing the placeholder. Query stays classic because it's gated on the resolved sequence + config-driven params.
- **`buildPreviewParams` / `DEFAULT_PREVIEW_CONFIG` shared between loader and component** (`lib/preview/preview-params.ts`) — deliberate dedup so the loader prefetches the exact key the component reads (first render is instant). Both default to the same config, so the keys match.
- **`shouldThrowToBoundary(error, hasData)` keyed on `query.state.data !== undefined`** — correct: it keeps a populated query's failed background refetch from tearing the view down, deferring that to the `QueryCache.onError` toast.
- **`getActionLogQueryOptions` hand-rolled** (`api/action-log.ts`) — acceptable; no orval entry exists for this endpoint, and the query key matches `getActionLogQueryKey` so prefetch + suspense read + invalidation share one cache entry. (The `limit` arg is intentionally outside the key; loader and component both pass 100.)
- **`bun run verify` red** — pre-existing backend `tsc` failure in the export command/route (missing `correlationId` per ADR 0012), unrelated to this branch; documented in `references/suggestions.md`. Frontend is fully green.
