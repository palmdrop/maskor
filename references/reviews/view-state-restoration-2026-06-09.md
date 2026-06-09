# Review: View-state restoration on navigation

**Date**: 2026-06-09
**Scope**: `packages/frontend/src/pages/FragmentPage.tsx`, `packages/frontend/src/pages/OverviewPage/index.tsx`, `packages/frontend/src/pages/PreviewPage/PreviewPage.tsx`, `packages/frontend/src/lib/nav-state.ts`, `packages/frontend/src/hooks/usePersistedScroll.ts`, `packages/frontend/src/pages/ProjectShellLayout.tsx`, `packages/frontend/src/lib/commands/global/navigation.ts`
**Plan**: `references/plans/view-state-restoration.md`
**Spec**: `specifications/navigation.md`

---

## Overall

The storage/resolver layer (`nav-state.ts`, `usePersistedScroll.ts`) and the entry-point wiring (navbar Links, `navigation:*` commands) are sound. The defects all live in the per-view **writer/restore effects**, and they are the reason the feature feels unreliable. Two of them are outright data-loss bugs: Fragments persists only the *first* fragment opened per page-mount, and Overview erases its stored selection on every mount before it can be read. Scroll restore is timing-fragile in both Overview and Preview because it fires before the content that determines scroll height has loaded. The plan is marked Done and the spec already has a Shipped entry, but the behavior does not match the stated goal.

---

## Bugs

### 1. Fragments only ever persists the first fragment opened per mount

`FragmentPage.tsx:24-33` — the `writeLastFragment` call is gated behind `hasRecordedVisitRef`, a one-shot ref intended only to dedupe `recordFragmentVisit` under StrictMode. The route `/$fragmentId` (`router.ts:60-64`) has no `key`, so navigating fragment A → B reuses the same `FragmentPage` instance; the effect re-runs with `fragmentId = B` but early-returns because the ref is already `true`.

```
open A → ref=false → write A, ref=true
open B (same instance) → effect re-runs → ref===true → early return → B never written
leave + return to Fragments → resolveLastFragmentView reads A → wrong fragment shown
```

localStorage is stuck on the first fragment for the lifetime of the mount. This is the primary reported symptom.

Fix: dedupe per-`fragmentId` instead of per-mount — track the last recorded `fragmentId` in the ref and run when it differs.

### 2. Overview selection is wiped on mount before it can be restored

`OverviewPage/index.tsx:377-379` (persist) runs before `:396-406` (restore), and React fires mount effects top-to-bottom. The persist effect fires first with the initial `selection = []`, overwriting the stored value; the restore effect then reads `[]` and restores nothing.

```
mount → persist effect: writeOverviewSelection(projectId, []) → stored value destroyed
      → restore effect: readOverviewSelection() → [] → setSelection never called
```

Fix: gate the persist effect on `hasRestoredSelectionRef` (declared above it) so it does not write until restore has run; an empty restore then leaves the stored value intact.

### 3. Scroll restore fires before scroll height is final (Overview)

`OverviewPage/index.tsx:382-392` — restore is gated on `contentReady = !bundleLoading && !summariesLoading`, but the scrollable height is produced by `ProseSpine`, which renders from a *separate* query (`useGetSequenceContents`, `:117`) that may still be loading. A single `requestAnimationFrame` then assigns `scrollTop` while the container is shorter than the saved offset, and the browser clamps it.

```
contentReady true (bundle+summaries) → rAF → scrollTop = offset
   but sequence-contents query still pending → scrollHeight < offset → clamped to max → wrong position
```

Fix: gate restore on the query that actually drives `ProseSpine` height (`useGetSequenceContents`) rather than on `bundle`/`summaries`.

### 4. Scroll restore is timing-fragile (Preview)

`PreviewPage.tsx:114-122` — restore fires on `assembled` ready with a single `requestAnimationFrame`. Markdown reflow plus the `IntersectionObserver`/`useFragmentAnchor` hash logic (`:130`, `:233-257`) can move the scroll after that one frame, so the restored position is not reliably honored.

Fix: out of scope for the "gate on real content query" decision, but the Preview path shares the same single-rAF weakness; revisit alongside bug 3 if Preview restore proves unreliable in practice.

---

## Design

### 5. Restore/persist effect ordering is an implicit contract

`OverviewPage/index.tsx` — the correctness of selection persistence depends entirely on the relative *declaration order* of the persist and restore effects and on a `hasRestored…` ref guard. This is fragile: a future reorder or extraction silently reintroduces bug 2. Consider colocating the persist+restore pair behind a single hook (e.g. `usePersistedSelection`) that encapsulates the "don't persist until restored" invariant, mirroring how `usePersistedScroll` already encapsulates debounced writes.

---

## Minor

### 6. Two refs do the same job under different names

`FragmentPage.tsx` uses `hasRecordedVisitRef` for two coupled concerns (visit recording + slot write). After the bug 1 fix the single per-`fragmentId` ref covers both; keep them in one effect but name the ref for what it tracks (`recordedFragmentIdRef`).

---

## Non-issues

- **Navbar Links read localStorage at render time** (`ProjectShellLayout.tsx:35-37`) — looks stale-prone, but TanStack re-renders matched route components on navigation, so the shell re-reads fresh values each time. The reported "wrong fragment" symptom is bug 1 (stuck localStorage), not Link staleness.
- **`navigation:*` commands read resolvers at `run()` time** (`navigation.ts`) — correct; always fresh, no staleness window.
- **Sequence persist guarded by `if (activeSequenceId)`** (`OverviewPage/index.tsx:372-374`, `PreviewPage.tsx:62-64`) — does not suffer the bug-2 wipe because it never writes a falsy/empty value over a good one.
- **`usePersistedScroll` debounce + unmount flush** — pending save is flushed in the cleanup effect, so navigating away mid-debounce still persists the last offset.
- **Selection restore filters against `fragmentByUuid`** (`OverviewPage/index.tsx:401`) — deleted fragments drop out on restore, matching the stale-reference guard in Phase 5.
