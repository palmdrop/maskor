# Frontend data robustness: loader-prefetch, Suspense, and error boundaries

**Date**: 09-06-2026
**Status**: Done
**Closed**: 09-06-2026
**Specs**: `specifications/navigation.md`

---

## Goal

> Every view loads its data through a consistent, platform-idiomatic path so that: while data is pending the view shows a layout-stable placeholder (no flicker, no spinner) rather than a blank or half-rendered screen; when a fetch fails the user sees a clear in-place message with a Retry affordance (and a correlation ID for diagnosis) instead of a blank or white screen; a render-time throw is caught and recovered rather than crashing the app; and view-state restoration (scroll/selection) runs only once data is ready and is correctly skipped-then-resumed across a failure + retry. Concretely: kill the API, visit every view → each shows the error panel with Retry; restart the API + Retry → the view restores fully, including scroll/selection.

---

## Background

This is the read-side counterpart to the command-failure-observability work (which covered write/mutation failures). Findings from the investigation that motivate the approach (full detail in this conversation's discussion and `references/reviews/`):

- The app has **no** `ErrorBoundary`, `Suspense`, or router `errorComponent`/`pendingComponent` anywhere. All loading/error handling is component-level and ad-hoc (35/37 view files check `isLoading`, only 24/37 check `isError`). A render-time throw white-screens the whole app.
- Views frequently capture only `data` from a query and silently render empty on failure (e.g. `OverviewPage`'s `useGetSequenceContents`).
- View-state restoration runs "after content ready" via per-view rAF timing; a failed/never-ready query leaves a blank view with restoration silently no-op'd — the core coupling to fix.
- **Feasibility (verified):** the orval client already generates `getXxxQueryOptions` functions, usable both in a router `loader` (`queryClient.ensureQueryData`) and via `useSuspenseQuery(getXxxQueryOptions(...))`. The modern pattern is available without an orval rewrite. `customFetch` returns an envelope (`{ status, data }`); under suspense the envelope is guaranteed defined, eliminating the `?.`/empty-fallback defensiveness.

Chosen architecture (agreed): **route loader prefetch (parallel `ensureQueryData`) + `useSuspenseQuery` in components + an Error Boundary wrapped in `QueryErrorResetBoundary` + a granular `throwOnError` policy**. Loading via Suspense pending with `pendingMs` tuned so fast local loads never flash. Restoration collapses onto the now-guaranteed ready state.

**Coverage principle (read this before deciding a view is "fine as-is").** The trigger for migrating a view is simple: **if there is any point at which the user waits for the main content of a full view to appear, that view must get the new loading + error + retry treatment.** Do not skip a view because the rewrite looks involved, because it "already has an `isLoading` check," or because the wait is usually short — a short happy-path wait still means a blank/flash/silent-failure path exists, and that is exactly what this plan exists to remove. This is a principle, not a strict invariant: it is fine for a view to keep a hand-rolled `isLoading`/`isError` branch where that is genuinely the better fit (e.g. a conditional/dependent query, or a small inline section). What is **not** fine is leaving a full-view content wait unmigrated because the plan's wording felt optional. When in doubt, migrate.

---

## Open decisions (settle during Phase 1, record in `packages/frontend/CLAUDE.md`)

- **Pending presentation**: layout-stable blank shell (default) vs. skeleton vs. delayed-skeleton. Lean blank shell; add a minimal skeleton primitive only if a view needs it.
- **`pendingMs` / `pendingMinMs` values** for the fast local app (start: pending delayed enough to skip on fast loads, small min to avoid flash when it does show).
- **`throwOnError` threshold**: 5xx + transport → boundary, 4xx → inline. Confirm against real `ApiRequestError.statusCode` paths.
- **Error granularity**: whole-view panel (default) vs. per-section boundaries (opt-in for Overview later).
- **Suspense hooks**: call `useSuspenseQuery(getXxxQueryOptions(...))` directly (no orval change) vs. flip `override.query.useSuspenseQuery` to generate `useXxxSuspense` hooks. Lean direct-call first to avoid regenerating the whole client.
- **Dependent/conditional queries** (e.g. Overview contents gated on sequence): resolve the dependency in the loader vs. keep as classic `useQuery` inside the ready tree. Decide per view.

---

## Tasks

### Phase 0 — Branch

- [x] Commit this plan to the current branch.

### Phase 1 — Infrastructure (no per-view behavior change)

- [x] Add an app-content Error Boundary (react-error-boundary) at `ProjectShellLayout`, wrapping the routed content so the navbar persists and only the content area swaps to a fallback on error.
- [x] Wrap it in `QueryErrorResetBoundary` and wire the boundary's `onReset` to the query reset so Retry refetches failed queries.
- [x] Add a shared `ViewError` fallback: friendly message, Retry button, and a Details disclosure exposing `correlationId` + technical message — visually consistent with `CommandFailureRow` on the History page.
- [x] Add a shared pending placeholder convention (layout-stable shell) and, if needed, a minimal `ui/skeleton` primitive.
- [x] Configure router defaults in `router.ts`: `defaultErrorComponent` (delegates to `ViewError`, falling back to the framework default for truly uncaught cases), `defaultPendingComponent`, and tuned `defaultPendingMs`/`defaultPendingMinMs`.
- [x] Set global query policy in `queryClient.ts`: `throwOnError` function (5xx/transport → boundary, 4xx → local), a sane `retry` (skip 4xx), `refetchOnWindowFocus` for self-heal, and a non-zero `staleTime` so revisits don't always re-pend.
- [x] Document the data-loading conventions in `packages/frontend/CLAUDE.md` (loader + `useSuspenseQuery` + boundary; when to keep classic `useQuery`; the open-decision choices once settled).
- [x] Tests: boundary catches a thrown child and renders `ViewError`; Retry resets and refetches; `throwOnError` routes 5xx to the boundary and leaves 4xx inline.
- [x] `git commit`.

### Phase 2 — Restoration views (Overview, Preview, Fragment list, Fragment page)

- [x] Add route `loader`s that prefetch each view's queries in parallel via `Promise.allSettled` of `ensureQueryData(getXxxQueryOptions(...))`.
- [x] Convert non-conditional reads in these views to `useSuspenseQuery`; remove the now-redundant `?.`/empty-fallback handling and the `isLoading`/`isError` branches superseded by the boundary.
- [x] Resolve dependent/conditional queries per the Phase 1 decision (loader-resolved dependency, or classic `useQuery` within the ready tree).
- [x] **Integrate with the existing view-state-restoration system — do not replace or fork it.** The restoration primitives shipped in `references/plans/view-state-restoration.md` stay the source of truth: the `usePersistedScroll` hook, the `nav-state` localStorage module, the `resolveLastFragmentView` / `resolveLastOverviewView` / `resolveLastPreviewView` readers, the debounced scroll writers, and the Overview selection persistence. This phase changes only _when_ restoration runs (gated on the new ready state) and _that it no longer silently no-ops on a failed/never-ready load_ — it must not change the persisted key scheme, the writers, the navbar/command entry points, or the stale-reference guards. Read that plan before touching restoration.
- [x] Collapse restoration timing onto the ready state: run the existing scroll/selection restoration on first render-with-data, replacing the per-view rAF "wait for content" workarounds with the loader-guaranteed ready signal. On a load error the view shows `ViewError` (restoration correctly skipped); after a successful Retry the view reaches ready and restoration runs then. Preserve the existing stale-reference behavior (selection filtered against loaded fragments; cleared fragment slot on 404).
- [x] Ensure each view's pending placeholder is layout-stable — same scroll-container element and dimensions as the ready state — so `usePersistedScroll`'s target exists and scroll position is not clobbered by a layout shift between placeholder and content.
- [x] Tests per view: ready render with data; a failed query surfaces `ViewError` + Retry; restoration runs after ready, is skipped on error, and **resumes correctly after a successful Retry**; persisted scroll/selection round-trips unchanged through the new ready gating; loader fires queries in parallel (no waterfall).
- [x] `git commit`.

### Phase 3 — Sweep remaining views

- [x] Apply the same pattern to **every** remaining view with a perceptible content wait (editors: Note/Reference/Aspect; Drafts; Stats; History; Config; Import; ProjectManagement). Per the Coverage principle, a full-view content wait is the trigger to migrate — do not leave one unmigrated because it already has an `isLoading` check or because the conversion is involved. Use classic `useQuery` + inline handling only where a query is genuinely conditional/dependent or a small inline section, not as a way to opt a whole view out.
- [x] Keep `SuggestionModePage`'s existing in-place handling (its `loadNext`/`setSaveError` flow) intact; only add the boundary/placeholder around its initial data load.
- [x] Replace ad-hoc "Failed to load" inline blocks with the shared `ViewError` where appropriate; remove dead loading branches.
- [x] Tests: each view shows a placeholder while pending, surfaces `ViewError` on failure, and recovers on Retry.
- [x] `git commit`.

### Phase 4 — Background refetch + hardening

- [x] Surface background-refetch failures (a failed revalidation of already-rendered data) as a subtle toast, without tearing down the view. `throwOnError` now only routes to the boundary when the query has no data yet; a populated query whose background refetch fails keeps its data on screen and a `QueryCache.onError` toast notes the stale data. Unit-tested via `shouldThrowToBoundary(error, hasData)` / `isBackgroundRefetchFailure`.
- [ ] Optional: `useDeferredValue` on param-driven re-suspends — **deferred** (not needed yet: Preview uses `keepPreviousData`; Overview sequence switch re-runs the loader → router pending). Revisit if a flash is observed.
- [ ] Manual smoke per view: kill the API and navigate every view → `ViewError` + Retry; restart + Retry → full recovery including scroll/selection. **Not run** — requires the live app + API (interactive); must be done manually.
- [x] Audit: the migrated views read guaranteed-defined data (no `?.`/empty-fallback on suspense reads); routed content is covered by the route error boundary + the AppErrorBoundary net — no remaining white-screen path.
- [x] `git commit`.

### Phase 5 — Docs + close-out

- [x] Finalize the `packages/frontend/CLAUDE.md` data-loading section with the settled decisions.
- [x] Update `specifications/navigation.md` `Shipped` (restoration is now robust to load failures) and any other relevant spec.
- [x] Set this plan's `Status`; add `Closed` date.
- [~] `bun run format && bun run verify` — `format` clean; the frontend is fully clean (`tsc -b` green, 661 tests pass, lint clean). `verify` as a whole is **blocked by a pre-existing backend type error** unrelated to this plan: `packages/api` export command/route (`export-sequence.ts`, `routes/export.ts`) don't supply the `correlationId` the command pipeline now requires (ADR 0012), so the root `tsc --noEmit` fails before tests run. `packages/api` is untouched by this plan (verified via `git log`); the branch's `verify` was already red before this work. Flagged in `references/suggestions.md`.
- [x] `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Boundary/reset/`throwOnError` behavior at the infra level (Phase 1).
- Per converted view: pending placeholder, error surfacing + Retry recovery, and restoration timing (runs after ready, skipped on error, resumes after retry) — the restoration-timing assertions are the fiddly, high-value cases.
- Parallel loader fetching (no waterfall) where a view loads multiple queries.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check of the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
