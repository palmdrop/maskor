# View-state restoration on navigation

**Date**: 08-06-2026
**Status**: Done
**Closed**: 09-06-2026
**Specs**: `specifications/navigation.md`

---

## Goal

When the user re-enters a view via the navbar or a `navigation:*` command, the view is restored to where they left it: Fragments reopens the last-opened fragment; Overview restores the selected sequence, scroll position, and fragment selection; Preview restores the selected sequence and scroll position. State persists across reloads via per-project localStorage. No backend changes — the Edit/suggestion page keeps its existing vault-DB cursor.

---

## Background (why localStorage, not backend)

- The Edit/suggestion page's restoration lives in the vault DB (`projectStateTable.currentFragmentUUID`) **because a server-side consumer needs it** — the suggestion algorithm reasons about the current cursor + visit history. It stays as-is.
- Overview-sequence, Preview-sequence, Overview-selection, and last-opened-fragment have **no server-side consumer**. They are pure client UI memory. Backend persistence would conflate ephemeral position with durable preference (`project.overview.detailLevel`, `project.preview.*`) and add a network write per interaction. localStorage is the honest home.
- Precedent already in repo: `usePersistedBoolean` (showDiscarded), `usePersistedCursor` (editor cursor offset — debounced, flushed on unmount).
- Scroll containers are inner `overflow-y-auto`/`<main>` elements, not the window, so TanStack Router's built-in window scroll restoration would not capture them; explicit element-scroll persistence is required regardless.

---

## Tasks

### Phase 0 — Branch

- [x] Already on `agent/better-navigation` worktree branch; no new branch needed. _(2026-06-09)_

### Phase 1 — Storage primitives

- [x] Add `usePersistedScroll` hook. _(2026-06-09)_
- [x] Add `nav-state` localStorage helper module with per-project key scheme and typed read/write. _(2026-06-09)_
- [x] Module exports `resolveLastFragmentView`, `resolveLastOverviewView`, `resolveLastPreviewView` readers. _(2026-06-09)_
- [x] Tests for `usePersistedScroll` and `nav-state` helper. _(2026-06-09)_

### Phase 2 — Writers (per view)

- [x] `FragmentPage`: writes `fragments.fragmentId` on open. _(2026-06-09)_
- [x] `OverviewPage`: persists sequence, scroll (debounced), and selection. _(2026-06-09)_
- [x] `PreviewPage`: persists sequence and scroll (debounced). _(2026-06-09)_

### Phase 3 — Restoration (per view, on mount)

- [x] `OverviewPage`: restores scroll after content ready (rAF-deferred); restores selection filtered against loaded fragments. _(2026-06-09)_
- [x] `PreviewPage`: restores scroll after `assembled` content renders. _(2026-06-09)_
- [x] Sequence restoration handled by entry points writing it into the URL. _(2026-06-09)_

### Phase 4 — Entry points (both navbar Links and commands)

- [x] `global/navigation.ts`: `go-to-fragment-list`, `go-to-overview`, `go-to-preview` use `resolveLastView` helpers. _(2026-06-09)_
- [x] `ProjectShellLayout` navbar Links for Fragments/Overview/Preview use `resolveLastView` helpers. _(2026-06-09)_
- [x] `global/__tests__/navigation.test.ts` updated with stored-slot present/absent cases. _(2026-06-09)_

### Phase 5 — Stale-reference guards

- [x] `FragmentPage`: clears stored fragmentId slot when the fragment query errors (404/deleted). _(2026-06-09)_
- [x] Overview selection: filtered against loaded fragment set on restore (deleted UUIDs drop out). _(2026-06-09)_
- [x] Sequence: existing `sequenceParamIsKnown` / `mainSequence` fallbacks cover deleted sequences. _(2026-06-09)_

### Phase 6 — Spec + close-out

- [x] `specifications/navigation.md` updated with Shipped entry. _(2026-06-09)_
- [x] `bun run format` + `bun run verify` — clean (pre-existing FragmentProse TS errors in tests unrelated to this work). _(2026-06-09)_
- [x] `git commit`. _(2026-06-09)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Unit: `usePersistedScroll`, `nav-state` helper (round-trip, defaults, malformed values).
- Unit: navigation commands resolve restored targets and degrade to bare routes when no slot is stored.
- Component/integration where practical: Overview/Preview restore scroll + sequence + selection on remount; stale references are dropped rather than throwing.
- Scroll-timing is the fiddly risk area — assert restore runs after content-ready, not on bare mount.

---

## Notes

- Open decision deferred to implementation: whether the navbar `<Link>`s call through the navigation commands or share only the `resolveLastView` reader. Plan assumes the shared-reader approach to keep Links declarative.
- Suggestion/Edit page is intentionally untouched — its backend cursor already satisfies restoration.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title (or continue on the existing `agent/better-navigation` branch if the developer prefers), and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. ALSO update the relevant frontmatter of `specifications/navigation.md` — add an item to the `Shipped` property with the features implemented. Do not include implementation details or granular tasks.
